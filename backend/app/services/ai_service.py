"""
Unified AI Service Layer
Provides a single interface for all AI operations across different providers
"""

import os
import requests
from openai import OpenAI
from typing import Dict, List, Optional, Any, Tuple
from flask import current_app
from app import db
from app.models.api_keys import APIKey
from app.models.ai_tools import AIToolModel, AITool
from app.utils.tool_model_resolver import resolve_tool_model, TOOL_PATH_TO_NAME
from datetime import datetime
import json

def create_openai_client(api_key: str, **kwargs) -> OpenAI:
    """
    Safely create an OpenAI client, filtering out unsupported parameters.
    
    The 'proxies' parameter is not supported in newer versions of the OpenAI SDK.
    This function uses multiple layers of filtering to ensure proxies never gets through.
    """
    import logging
    import traceback
    import inspect
    logger = logging.getLogger(__name__)
    
    # LAYER 1: Explicit proxies removal (always do this first)
    unsupported_params = {'proxies', '_caller'}
    kwargs = {k: v for k, v in kwargs.items() if k not in unsupported_params}
    
    # LAYER 2: Get OpenAI's __init__ signature to know which parameters are actually accepted
    accepted_params = None
    try:
        sig = inspect.signature(OpenAI.__init__)
        accepted_params = set(sig.parameters.keys())
        # Remove 'self' from accepted params
        accepted_params.discard('self')
    except Exception as e:
        logger.warning(f"Could not inspect OpenAI signature: {e}. Using explicit filtering only.")
        accepted_params = None
    
    # LAYER 3: Filter kwargs based on signature (most robust) or explicit filtering
    if accepted_params:
        # Only include parameters that are in OpenAI's signature
        filtered_kwargs = {k: v for k, v in kwargs.items() if k in accepted_params}
        
        # Log if we filtered anything out
        filtered_out = set(kwargs.keys()) - set(filtered_kwargs.keys())
        if filtered_out:
            logger.debug(f"Filtered out parameters not in OpenAI signature: {filtered_out}")
    else:
        # Fallback: use kwargs as-is (already filtered proxies in Layer 1)
        filtered_kwargs = kwargs.copy()
    
    # LAYER 4: Final defensive check - ensure proxies is absolutely not present
    if 'proxies' in filtered_kwargs:
        logger.error(f"CRITICAL: proxies still in filtered_kwargs after all filtering! Removing it.")
        filtered_kwargs.pop('proxies', None)
    
    # LAYER 5: Create client with only supported parameters, with retry logic
    try:
        return OpenAI(api_key=api_key, **filtered_kwargs)
    except TypeError as e:
        error_msg = str(e).lower()
        # If we get a TypeError about proxies, retry with only api_key (no kwargs at all)
        if 'proxies' in error_msg:
            logger.error(f"PROXIES ERROR in create_openai_client despite filtering! Error: {e}")
            logger.error(f"Filtered kwargs keys: {list(filtered_kwargs.keys())}")
            logger.error(f"Original kwargs keys: {list(kwargs.keys())}")
            if accepted_params:
                logger.error(f"Accepted params from signature: {accepted_params}")
            logger.error(f"Stack trace:\n{''.join(traceback.format_stack())}")
            
            # RETRY: Try again with only api_key, no kwargs at all
            logger.warning("Retrying OpenAI client creation with only api_key (no kwargs)")
            try:
                return OpenAI(api_key=api_key)
            except Exception as retry_error:
                logger.error(f"Retry also failed: {retry_error}")
                raise TypeError(f"OpenAI client initialization failed due to proxies parameter. "
                              f"Even retry without kwargs failed. "
                              f"Original error: {e}, Retry error: {retry_error}") from e
        raise

class AIService:
    """Unified service for AI operations across multiple providers"""
    
    def __init__(self):
        # Only store non-credential config from environment
        self.ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')
        
        # Note: API keys are now loaded from database via CredentialService
        # OpenAI client is created on-demand in _openai_chat() to ensure
        # we always fetch the latest key from database first (consistent with other providers)
    
    def get_api_key_for_provider(self, provider: str) -> Optional[str]:
        """Get API key for a provider from database via CredentialService"""
        try:
            # First try CredentialService (ExternalCredential model)
            from app.services.credential_service import credential_service
            api_key = credential_service.get_provider_api_key(provider)
            if api_key:
                return api_key
            
            # Fallback to APIKey model (legacy support)
            try:
                api_key_record = APIKey.query.filter_by(
                    provider=provider,
                    is_active=True,
                    is_valid=True
                ).first()
                
                if api_key_record:
                    return api_key_record.get_api_key()
            except Exception:
                pass  # APIKey model might not exist
                
        except ImportError:
            current_app.logger.warning("CredentialService not available")
        except Exception as e:
            current_app.logger.error(f"Error getting API key for {provider}: {e}")
        
        return None
    
    def get_available_providers(self) -> List[str]:
        """Get list of providers that have active and valid API keys"""
        available = []
        try:
            # Get from database
            api_keys = APIKey.query.filter_by(
                is_active=True,
                is_valid=True
            ).all()
            
            for key in api_keys:
                if key.provider and key.provider not in available:
                    available.append(key.provider)
            
            # Also check environment variables
            if self.openai_api_key and 'openai' not in available:
                available.append('openai')
            if self.anthropic_api_key and 'anthropic' not in available:
                available.append('anthropic')
            if self.groq_api_key and 'groq' not in available:
                available.append('groq')
            # Ollama doesn't need API keys
            if 'ollama' not in available:
                available.append('ollama')
                
        except Exception as e:
            current_app.logger.error(f"Error getting available providers: {e}")
        
        return available
    
    def has_api_key_for_provider(self, provider: str) -> bool:
        """Check if an API key is available for a provider"""
        return self.get_api_key_for_provider(provider) is not None or provider == 'ollama'
    
    def get_model_config(self, model_name: str) -> Optional[Dict]:
        """Get model configuration from database"""
        try:
            model = AIToolModel.query.filter_by(name=model_name, is_active=True).first()
            if model:
                return model.to_dict()
        except Exception as e:
            current_app.logger.error(f"Error getting model config: {e}")
        
        return None
    
    def get_tool_config(self, tool_name: str) -> Optional[Dict]:
        """Get tool configuration from database"""
        try:
            tool = AITool.query.filter_by(name=tool_name, is_active=True).first()
            if tool:
                return tool.to_dict()
        except Exception as e:
            current_app.logger.error(f"Error getting tool config: {e}")
        
        return None
    
    def _detect_provider(self, model: str) -> str:
        """Detect provider from model name"""
        model_lower = model.lower()
        
        if 'gpt' in model_lower or 'davinci' in model_lower or 'curie' in model_lower:
            return 'openai'
        elif 'claude' in model_lower:
            return 'anthropic'
        elif 'llama' in model_lower or 'mixtral' in model_lower or 'gemma' in model_lower:
            return 'groq'
        elif 'ollama' in model_lower:
            return 'ollama'
        else:
            # Default to OpenAI for unknown models
            return 'openai'
    
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = 'gpt-4',
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Unified chat completion across providers
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model identifier
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            
        Returns:
            Dict with 'text', 'usage', 'model', 'provider'
        """
        model_config = self.get_model_config(model)
        provider = model_config.get('provider') if model_config else self._detect_provider(model)
        
        # Check if API key is available for the provider
        if not self.has_api_key_for_provider(provider):
            available_providers = self.get_available_providers()
            error_msg = f"API key not configured for provider '{provider}'. Available providers: {', '.join(available_providers)}"
            current_app.logger.warning(error_msg)
            raise ValueError(error_msg)
        
        try:
            if provider == 'openai':
                return self._openai_chat(messages, model, temperature, max_tokens)
            elif provider == 'anthropic':
                return self._anthropic_chat(messages, model, temperature, max_tokens)
            elif provider == 'groq':
                return self._groq_chat(messages, model, temperature, max_tokens)
            elif provider == 'ollama':
                return self._ollama_chat(messages, model, temperature, max_tokens)
            else:
                raise ValueError(f"Unsupported provider: {provider}")
                
        except Exception as e:
            # Log detailed error with context
            error_detail = str(e)
            current_app.logger.error(
                f"Chat completion error - Provider: {provider}, Model: {model}, Error: {error_detail}",
                exc_info=True
            )
            
            # Check if it's a proxies error specifically
            if 'proxies' in error_detail.lower():
                current_app.logger.error(
                    "PROXIES ERROR DETECTED in chat_completion! "
                    "Attempting to work around by creating fresh client without any kwargs."
                )
                
                # Retry with a completely fresh approach - create new client with only api_key
                # This bypasses any cached code that might be passing proxies
                try:
                    current_app.logger.info("Retrying chat completion with fresh OpenAI client (no kwargs)")
                    api_key = self.get_api_key_for_provider(provider)
                    if not api_key:
                        raise ValueError(f"API key not available for {provider}")
                    
                    # Create client with ONLY api_key - no kwargs at all
                    fresh_client = create_openai_client(api_key=api_key)
                    
                    # Use the fresh client directly
                    if provider == 'openai':
                        response = fresh_client.chat.completions.create(
                            model=model,
                            messages=messages,
                            temperature=temperature,
                            max_tokens=max_tokens
                        )
                        return {
                            'text': response.choices[0].message.content,
                            'usage': {
                                'prompt_tokens': response.usage.prompt_tokens,
                                'completion_tokens': response.usage.completion_tokens,
                                'total_tokens': response.usage.total_tokens
                            },
                            'model': model,
                            'provider': 'openai',
                            'finish_reason': response.choices[0].finish_reason
                        }
                except Exception as retry_error:
                    current_app.logger.error(f"Retry after proxies error also failed: {retry_error}")
                    raise ValueError(
                        f"AI service initialization error (proxies parameter). "
                        f"Provider: {provider}, Model: {model}. "
                        f"Even after retry with fresh client, error persists. "
                        f"Original error: {error_detail}, Retry error: {retry_error}"
                    )
            
            # For other errors, raise with context instead of returning fallback
            # This allows endpoints to handle errors properly
            from app.utils.security import sanitize_error_message
            sanitized_msg = sanitize_error_message(
                f"AI service error for {provider}/{model}: {error_detail}",
                expose_details=False
            )
            raise ValueError(sanitized_msg)
    
    def _openai_chat(
        self,
        messages: List[Dict],
        model: str,
        temperature: float,
        max_tokens: int
    ) -> Dict:
        """OpenAI chat completion"""
        api_key = self.get_api_key_for_provider('openai')
        if not api_key:
            raise ValueError("OpenAI API key not configured")
        
        # Create client with the API key
        client = create_openai_client(api_key=api_key)
        
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            return {
                'text': response.choices[0].message.content,
                'usage': {
                    'prompt_tokens': response.usage.prompt_tokens,
                    'completion_tokens': response.usage.completion_tokens,
                    'total_tokens': response.usage.total_tokens
                },
                'model': model,
                'provider': 'openai',
                'finish_reason': response.choices[0].finish_reason
            }
        except Exception as e:
            # P2 Fix: Log detailed error but return sanitized message
            error_detail = str(e)
            current_app.logger.error(f"OpenAI API error: {error_detail}", exc_info=True)
            
            # Check if it's a proxies error and provide helpful message
            if 'proxies' in error_detail.lower():
                current_app.logger.error("PROXIES ERROR DETECTED in _openai_chat! This should not happen with create_openai_client()")
                current_app.logger.error(f"Error details: {error_detail}")
                current_app.logger.error("This indicates the server needs to be restarted or code needs update")
                raise ValueError("AI service error: __init__() got an unexpected keyword argument 'proxies'")
            
            from app.utils.security import sanitize_error_message
            sanitized_msg = sanitize_error_message(f"AI service error: {error_detail}", expose_details=False)
            raise ValueError(sanitized_msg)
    
    def _anthropic_chat(
        self,
        messages: List[Dict],
        model: str,
        temperature: float,
        max_tokens: int
    ) -> Dict:
        """Anthropic Claude chat completion"""
        api_key = self.get_api_key_for_provider('anthropic')
        if not api_key:
            raise ValueError("Anthropic API key not configured")
        
        url = 'https://api.anthropic.com/v1/messages'
        headers = {
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        }
        
        # Convert messages to Anthropic format
        system_message = next((m['content'] for m in messages if m['role'] == 'system'), None)
        anthropic_messages = [m for m in messages if m['role'] != 'system']
        
        payload = {
            'model': model,
            'messages': anthropic_messages,
            'max_tokens': max_tokens,
            'temperature': temperature
        }
        
        if system_message:
            payload['system'] = system_message
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            return {
                'text': data['content'][0]['text'],
                'usage': {
                    'prompt_tokens': data['usage'].get('input_tokens', 0),
                    'completion_tokens': data['usage'].get('output_tokens', 0),
                    'total_tokens': data['usage'].get('input_tokens', 0) + data['usage'].get('output_tokens', 0)
                },
                'model': model,
                'provider': 'anthropic',
                'finish_reason': data.get('stop_reason')
            }
        except requests.exceptions.RequestException as e:
            # P2 Fix: Log detailed error but return sanitized message
            error_detail = str(e)
            current_app.logger.error(f"Anthropic API request error: {error_detail}", exc_info=True)
            from app.utils.security import sanitize_error_message
            sanitized_msg = sanitize_error_message(f"Anthropic API request failed: {error_detail}", expose_details=False)
            raise ValueError(sanitized_msg)
        except KeyError as e:
            current_app.logger.error(f"Anthropic API response format error: {e}", exc_info=True)
            raise ValueError("Anthropic API response format error")
        except Exception as e:
            error_detail = str(e)
            current_app.logger.error(f"Anthropic API error: {error_detail}", exc_info=True)
            from app.utils.security import sanitize_error_message
            sanitized_msg = sanitize_error_message(f"Anthropic API error: {error_detail}", expose_details=False)
            raise ValueError(sanitized_msg)
    
    def _groq_chat(
        self,
        messages: List[Dict],
        model: str,
        temperature: float,
        max_tokens: int
    ) -> Dict:
        """Groq chat completion"""
        api_key = self.get_api_key_for_provider('groq')
        if not api_key:
            raise ValueError("Groq API key not configured")
        
        url = 'https://api.groq.com/openai/v1/chat/completions'
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'model': model,
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens
        }
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            usage = data.get('usage', {})
            return {
                'text': data['choices'][0]['message']['content'],
                'usage': {
                    'prompt_tokens': usage.get('prompt_tokens', 0),
                    'completion_tokens': usage.get('completion_tokens', 0),
                    'total_tokens': usage.get('total_tokens', 0)
                },
                'model': model,
                'provider': 'groq',
                'finish_reason': data['choices'][0].get('finish_reason')
            }
        except requests.exceptions.RequestException as e:
            # P2 Fix: Log detailed error but return sanitized message
            error_detail = str(e)
            current_app.logger.error(f"Groq API request error: {error_detail}", exc_info=True)
            from app.utils.security import sanitize_error_message
            sanitized_msg = sanitize_error_message(f"Groq API request failed: {error_detail}", expose_details=False)
            raise ValueError(sanitized_msg)
        except (KeyError, IndexError) as e:
            current_app.logger.error(f"Groq API response format error: {e}", exc_info=True)
            raise ValueError("Groq API response format error")
        except Exception as e:
            error_detail = str(e)
            current_app.logger.error(f"Groq API error: {error_detail}", exc_info=True)
            from app.utils.security import sanitize_error_message
            sanitized_msg = sanitize_error_message(f"Groq API error: {error_detail}", expose_details=False)
            raise ValueError(sanitized_msg)
    
    def _ollama_chat(
        self,
        messages: List[Dict],
        model: str,
        temperature: float,
        max_tokens: int
    ) -> Dict:
        """Ollama local chat completion"""
        # Extract model name from ollama/model_name format
        local_model = model.split('/', 1)[1] if '/' in model else model
        
        url = f'{self.ollama_base_url}/api/chat'
        payload = {
            'model': local_model,
            'messages': messages,
            'options': {
                'temperature': temperature,
                'num_predict': max_tokens
            }
        }
        
        response = requests.post(url, json=payload, timeout=120)
        response.raise_for_status()
        data = response.json()
        
        text = data.get('message', {}).get('content', '') or data.get('response', '')
        
        return {
            'text': text,
            'usage': {
                'prompt_tokens': 0,
                'completion_tokens': 0,
                'total_tokens': 0
            },
            'model': model,
            'provider': 'ollama',
            'finish_reason': 'stop'
        }
    
    def _detect_provider(self, model: str) -> str:
        """Detect provider from model name"""
        if model.startswith('gpt-') or model.startswith('dall-e'):
            return 'openai'
        elif model.startswith('claude'):
            return 'anthropic'
        elif model.startswith('llama') or model.startswith('mixtral'):
            return 'groq'
        elif model.startswith('ollama/'):
            return 'ollama'
        else:
            return 'openai'  # Default to OpenAI
    
    def generate_image(
        self,
        prompt: str,
        model: str = 'dall-e-3',
        size: str = '1024x1024',
        quality: str = 'standard',
        style: str = 'natural'
    ) -> Dict[str, Any]:
        """
        Generate image using DALL-E
        
        Args:
            prompt: Image description
            model: Model to use (dall-e-2, dall-e-3)
            size: Image size
            quality: Image quality (standard, hd)
            style: Image style (natural, vivid)
            
        Returns:
            Dict with 'image_url', 'model', 'provider'
        """
        api_key = self.get_api_key_for_provider('openai')
        if not api_key:
            raise ValueError("OpenAI API key not configured")
        
        # Use new OpenAI SDK
        client = create_openai_client(api_key=api_key)
        
        try:
            # Build parameters for image generation
            image_params = {
                'prompt': prompt,
                'n': 1,
                'size': size
            }
            
            # Add quality and style only for dall-e-3
            if model == 'dall-e-3':
                image_params['quality'] = quality
                image_params['style'] = style
            
            response = client.images.generate(
                model=model,
                **image_params
            )
            
            return {
                'image_url': response.data[0].url,
                'model': model,
                'provider': 'openai',
                'revised_prompt': getattr(response.data[0], 'revised_prompt', None)
            }
            
        except Exception as e:
            error_detail = str(e)
            current_app.logger.error(f"Image generation error: {error_detail}", exc_info=True)
            
            # Check if it's a proxies error and provide helpful message
            if 'proxies' in error_detail.lower():
                current_app.logger.error("PROXIES ERROR DETECTED in generate_image! This should not happen with create_openai_client()")
                raise ValueError("Image generation failed: Proxies parameter error (this indicates code needs update or server restart)")
            
            from app.utils.security import sanitize_error_message
            sanitized_msg = sanitize_error_message(f"Image generation failed: {error_detail}", expose_details=False)
            raise ValueError(sanitized_msg)
    
    def translate_prompt(
        self,
        prompt: str,
        source_model: str,
        target_model: str,
        tool_name: str = 'prompt_translator',
        tool_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Translate prompt between AI models
        
        Args:
            prompt: Original prompt
            source_model: Source model name
            target_model: Target model name
            tool_name: Tool name for configuration lookup
            tool_path: Tool path (e.g., '/prompt-translator') - takes precedence over tool_name
            
        Returns:
            Dict with 'translated_prompt', 'explanation', 'tips'
        """
        # Resolve model using tool path or tool name
        if tool_path:
            model_to_use, _ = resolve_tool_model(tool_path)
        else:
            # Find tool path from tool name
            tool_path = None
            for path, name in TOOL_PATH_TO_NAME.items():
                if name == tool_name:
                    tool_path = path
                    break
            
            if tool_path:
                model_to_use, _ = resolve_tool_model(tool_path, tool_name)
            else:
                # Fallback to old method
                tool_config = self.get_tool_config(tool_name)
                model_to_use = tool_config.get('default_model', 'gpt-4') if tool_config else 'gpt-4'
        
        translation_prompt = f"""
        You are an expert in AI prompt engineering. Translate the following prompt from {source_model} format to {target_model} format.
        
        Original prompt (for {source_model}):
        {prompt}
        
        Target model: {target_model}
        
        Provide a JSON response with the following structure:
        {{
            "translated_prompt": "the translated and optimized prompt for {target_model}",
            "explanation": "brief explanation of changes made and why",
            "tips": ["tip 1", "tip 2", "tip 3"] (3 tips for using this prompt with {target_model})
        }}
        
        Consider the strengths and characteristics of {target_model} when translating.
        """
        
        messages = [{"role": "user", "content": translation_prompt}]
        
        try:
            result = self.chat_completion(
                messages=messages,
                model=model_to_use,
                temperature=0.7,
                max_tokens=1000
            )
            
            # Parse JSON response
            try:
                translated_data = json.loads(result['text'])
            except:
                # Fallback if JSON parsing fails
                translated_data = {
                    'translated_prompt': f"Optimized for {target_model}: {prompt}",
                    'explanation': result['text'][:200],
                    'tips': [
                        f"This prompt has been optimized for {target_model}",
                        "Adjust parameters based on your specific needs",
                        "Test the prompt with different variations"
                    ]
                }
            
            translated_data['usage'] = result['usage']
            translated_data['model_used'] = result['model']
            
            return translated_data
            
        except Exception as e:
            current_app.logger.error(f"Prompt translation error: {e}")
            raise
    
    def generate_creative_content(
        self,
        prompt: str,
        genre: str = 'general',
        word_count: int = 500,
        title: str = '',
        tool_name: str = 'creative_writing',
        tool_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate creative content
        
        Args:
            prompt: Content description/prompt
            genre: Genre of content
            word_count: Target word count
            title: Optional title
            tool_name: Tool name for configuration lookup
            tool_path: Tool path (e.g., '/creative-writing') - takes precedence over tool_name
            
        Returns:
            Dict with 'content', 'word_count', 'model'
        """
        # Resolve model using tool path or tool name
        if tool_path:
            model_to_use, _ = resolve_tool_model(tool_path)
        else:
            # Find tool path from tool name
            tool_path = None
            for path, name in TOOL_PATH_TO_NAME.items():
                if name == tool_name:
                    tool_path = path
                    break
            
            if tool_path:
                model_to_use, _ = resolve_tool_model(tool_path, tool_name)
            else:
                # Fallback to old method
                tool_config = self.get_tool_config(tool_name)
                model_to_use = tool_config.get('default_model', 'gpt-4') if tool_config else 'gpt-4'
        
        generation_prompt = f"""
        You are a creative writing assistant. Generate {genre} content based on the following:
        
        {f"Title: {title}" if title else ""}
        Prompt: {prompt}
        Target length: approximately {word_count} words
        
        Write engaging, creative content that matches the {genre} genre. 
        Make it compelling and well-structured.
        """
        
        messages = [{"role": "user", "content": generation_prompt}]
        
        try:
            result = self.chat_completion(
                messages=messages,
                model=model_to_use,
                temperature=0.8,  # Higher temperature for creativity
                max_tokens=int(word_count * 1.5)  # Allow extra tokens
            )
            
            content = result['text']
            actual_word_count = len(content.split())
            
            return {
                'content': content,
                'word_count': actual_word_count,
                'model': result['model'],
                'usage': result['usage']
            }
            
        except Exception as e:
            current_app.logger.error(f"Content generation error: {e}")
            raise
    
    def generate_code(
        self,
        prompt: str,
        language: str = 'python',
        framework: str = '',
        tool_name: str = 'code_workshop',
        tool_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate code from natural language
        
        Args:
            prompt: Code description
            language: Programming language
            framework: Optional framework
            tool_name: Tool name for configuration lookup
            tool_path: Tool path (e.g., '/code-generation-workshop') - takes precedence over tool_name
            
        Returns:
            Dict with 'code', 'explanation', 'language'
        """
        # Resolve model using tool path or tool name
        if tool_path:
            model_to_use, _ = resolve_tool_model(tool_path)
        else:
            # Find tool path from tool name
            tool_path = None
            for path, name in TOOL_PATH_TO_NAME.items():
                if name == tool_name:
                    tool_path = path
                    break
            
            if tool_path:
                model_to_use, _ = resolve_tool_model(tool_path, tool_name)
            else:
                # Fallback to old method
                tool_config = self.get_tool_config(tool_name)
                model_to_use = tool_config.get('default_model', 'gpt-4') if tool_config else 'gpt-4'
        
        code_prompt = f"""
        Generate {language} code for the following requirement:
        
        {prompt}
        
        {f"Use {framework} framework." if framework else ""}
        
        Provide a JSON response with:
        {{
            "code": "the complete code",
            "explanation": "brief explanation of the code",
            "language": "{language}",
            "notes": ["important note 1", "important note 2"]
        }}
        
        Include proper comments, error handling, and follow best practices.
        """
        
        messages = [{"role": "user", "content": code_prompt}]
        
        try:
            result = self.chat_completion(
                messages=messages,
                model=model_to_use,
                temperature=0.3,  # Lower temperature for code generation
                max_tokens=2000
            )
            
            # Parse JSON response
            try:
                code_data = json.loads(result['text'])
            except:
                # Fallback if JSON parsing fails
                code_data = {
                    'code': result['text'],
                    'explanation': 'Generated code',
                    'language': language,
                    'notes': ['Review the code before use']
                }
            
            code_data['usage'] = result['usage']
            code_data['model_used'] = result['model']
            
            return code_data
            
        except Exception as e:
            current_app.logger.error(f"Code generation error: {e}")
            raise
    
    def grade_prompt(
        self,
        prompt: str,
        criteria: List[str] = None,
        tool_name: str = 'prompt_sandbox',
        tool_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Grade a prompt using AI
        
        Args:
            prompt: Prompt to grade
            criteria: Grading criteria
            tool_name: Tool name for configuration lookup
            tool_path: Tool path (e.g., '/prompt-engineering-sandbox') - takes precedence over tool_name
            
        Returns:
            Dict with 'score', 'feedback', 'suggestions', 'breakdown'
        """
        # Resolve model using tool path or tool name
        if tool_path:
            model_to_use, _ = resolve_tool_model(tool_path)
        else:
            # Find tool path from tool name
            tool_path = None
            for path, name in TOOL_PATH_TO_NAME.items():
                if name == tool_name:
                    tool_path = path
                    break
            
            if tool_path:
                model_to_use, _ = resolve_tool_model(tool_path, tool_name)
            else:
                # Fallback to old method
                tool_config = self.get_tool_config(tool_name)
                model_to_use = tool_config.get('default_model', 'gpt-4') if tool_config else 'gpt-4'
        
        if not criteria:
            criteria = ['clarity', 'specificity', 'completeness', 'effectiveness']
        
        grading_prompt = f"""
        Grade the following prompt based on these criteria: {', '.join(criteria)}
        
        Prompt to grade:
        {prompt}
        
        Provide a JSON response with:
        {{
            "score": 85 (0-100),
            "feedback": "detailed feedback",
            "suggestions": ["suggestion 1", "suggestion 2"],
            "breakdown": {{
                "clarity": "assessment",
                "specificity": "assessment",
                ...
            }}
        }}
        """
        
        messages = [{"role": "user", "content": grading_prompt}]
        
        try:
            result = self.chat_completion(
                messages=messages,
                model=model_to_use,
                temperature=0.3,
                max_tokens=1000
            )
            
            # Parse JSON response
            try:
                grade_data = json.loads(result['text'])
            except:
                # Fallback if JSON parsing fails
                grade_data = {
                    'score': 75,
                    'feedback': result['text'],
                    'suggestions': ['Review prompt structure', 'Add more specific details'],
                    'breakdown': {criterion: 'Good' for criterion in criteria}
                }
            
            grade_data['usage'] = result['usage']
            grade_data['model_used'] = result['model']
            
            return grade_data
            
        except Exception as e:
            current_app.logger.error(f"Prompt grading error: {e}")
            raise


# Singleton instance
_ai_service = None

def get_ai_service(force_reload: bool = False) -> AIService:
    """Get or create AI service instance
    
    Args:
        force_reload: If True, reset singleton and create fresh instance
    """
    global _ai_service
    import os
    flask_env = os.getenv('FLASK_ENV', 'development')
    
    # Force reload if requested
    if force_reload:
        _ai_service = None
    
    # In development mode, always create fresh instances to ensure latest code is used
    # This prevents issues with cached code when server hasn't been restarted
    if flask_env == 'development' or force_reload:
        # Always create new instance in development to pick up code changes
        return AIService()
    else:
        # Use singleton in production for performance
        if _ai_service is None:
            _ai_service = AIService()
        return _ai_service

def reset_ai_service():
    """Reset the AI service singleton (useful for testing or after code changes)"""
    global _ai_service
    _ai_service = None

