"""
OpenAI API integration endpoints
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.ai_usage import AIUsageLog, PromptGradingResult
from app.models.user import User
from app.utils.auth_decorators import require_auth, require_admin
from app.errors import ValidationError, OpenAIError
from app.utils.responses import APIResponse
from openai import OpenAI as OpenAIClient
import os
from datetime import datetime
import requests
import logging

logger = logging.getLogger(__name__)

def create_openai_client_safe(api_key: str, **kwargs) -> OpenAIClient:
    """
    Safely create an OpenAI client, filtering out unsupported parameters.
    
    The 'proxies' parameter is not supported in newer versions of the OpenAI SDK.
    This function uses multiple layers of filtering to ensure proxies never gets through.
    """
    import traceback
    import inspect
    
    # LAYER 1: Explicit proxies removal (always do this first)
    unsupported_params = {'proxies', '_caller'}
    kwargs = {k: v for k, v in kwargs.items() if k not in unsupported_params}
    
    # LAYER 2: Get OpenAI's __init__ signature to know which parameters are actually accepted
    accepted_params = None
    try:
        sig = inspect.signature(OpenAIClient.__init__)
        accepted_params = set(sig.parameters.keys())
        # Remove 'self' from accepted params
        accepted_params.discard('self')
    except Exception as e:
        logger.warning(f"Could not inspect OpenAIClient signature: {e}. Using explicit filtering only.")
        accepted_params = None
    
    # LAYER 3: Filter kwargs based on signature (most robust) or explicit filtering
    if accepted_params:
        # Only include parameters that are in OpenAI's signature
        filtered_kwargs = {k: v for k, v in kwargs.items() if k in accepted_params}
        
        # Log if we filtered anything out
        filtered_out = set(kwargs.keys()) - set(filtered_kwargs.keys())
        if filtered_out:
            logger.debug(f"Filtered out parameters not in OpenAIClient signature: {filtered_out}")
    else:
        # Fallback: use kwargs as-is (already filtered proxies in Layer 1)
        filtered_kwargs = kwargs.copy()
    
    # LAYER 4: Final defensive check - ensure proxies is absolutely not present
    if 'proxies' in filtered_kwargs:
        logger.error(f"CRITICAL: proxies still in filtered_kwargs after all filtering! Removing it.")
        filtered_kwargs.pop('proxies', None)
    
    # LAYER 5: Create client with only supported parameters, with retry logic
    try:
        return OpenAIClient(api_key=api_key, **filtered_kwargs)
    except TypeError as e:
        error_msg = str(e).lower()
        # If we get a TypeError about proxies, retry with only api_key (no kwargs at all)
        if 'proxies' in error_msg:
            logger.error(f"PROXIES ERROR in create_openai_client_safe despite filtering! Error: {e}")
            logger.error(f"Filtered kwargs keys: {list(filtered_kwargs.keys())}")
            logger.error(f"Original kwargs keys: {list(kwargs.keys())}")
            if accepted_params:
                logger.error(f"Accepted params from signature: {accepted_params}")
            logger.error(f"Stack trace:\n{''.join(traceback.format_stack())}")
            
            # RETRY: Try again with only api_key, no kwargs at all
            logger.warning("Retrying OpenAIClient creation with only api_key (no kwargs)")
            try:
                return OpenAIClient(api_key=api_key)
            except Exception as retry_error:
                logger.error(f"Retry also failed: {retry_error}")
                raise TypeError(f"OpenAI client initialization failed due to proxies parameter. "
                              f"Even retry without kwargs failed. "
                              f"Original error: {e}, Retry error: {retry_error}") from e
        raise

openai_bp = Blueprint('openai', __name__)

# Environment variables for API keys (used as fallback)
OPENAI_API_KEY_ENV = os.getenv('OPENAI_API_KEY')
GROQ_API_KEY = os.getenv('GROQ_API_KEY')
OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')

# Dynamic AI model loading from database
def get_available_models():
    """Get available AI models from database configuration"""
    try:
        from app.models.ai_tools import AIToolModel
        
        models = AIToolModel.query.filter_by(is_active=True).all()
        available_models = {}
        
        for model in models:
            available_models[model.name] = {
                'name': model.display_name,
                'provider': model.provider,
                'max_tokens': model.max_tokens,
                'cost_per_1k_tokens_input': model.cost_per_1k_tokens_input,
                'cost_per_1k_tokens_output': model.cost_per_1k_tokens_output,
                'description': model.description or f'{model.display_name} AI model',
                'capabilities': model.capabilities or ['text_generation'],
                'type': model.type,
                'model_id': model.model_id
            }
        
        return available_models
    except Exception as e:
        # Fallback to basic models if database is not available
        return {
            'gpt-3.5-turbo': {
                'name': 'GPT-3.5 Turbo',
                'provider': 'openai',
                'max_tokens': 4096,
                'cost_per_1k_tokens_input': 0.0015,
                'cost_per_1k_tokens_output': 0.002,
                'description': 'Fast and cost-effective model',
                'capabilities': ['text_generation'],
                'type': 'text',
                'model_id': 'gpt-3.5-turbo'
            }
        }

# Cache models for performance
_cached_models = None
_cache_timestamp = None

def get_cached_models():
    """Get models with caching for performance"""
    global _cached_models, _cache_timestamp
    import time
    
    current_time = time.time()
    # Cache for 5 minutes
    if _cached_models is None or (current_time - _cache_timestamp) > 300:
        _cached_models = get_available_models()
        _cache_timestamp = current_time
    
    return _cached_models

# Legacy support - will be populated dynamically
AVAILABLE_MODELS = {}

@openai_bp.route('/config', methods=['GET'])
@jwt_required()
def get_config():
    """Get AI configuration and available models"""
    try:
        user_id = get_jwt_identity()
        
        # Get user's preferred model
        user = User.query.get(user_id)
        preferred_model = getattr(user, 'preferred_ai_model', 'gpt-3.5-turbo')
        
        # Get dynamic models from database
        available_models = get_cached_models()
        
        return jsonify({
            'models': [
                {
                    'id': model_id,
                    'name': model_info['name'],
                    'provider': model_info['provider'],
                    'description': model_info['description'],
                    'max_tokens': model_info['max_tokens'],
                    'cost_per_1k_tokens_input': model_info.get('cost_per_1k_tokens_input', 0),
                    'cost_per_1k_tokens_output': model_info.get('cost_per_1k_tokens_output', 0),
                    'capabilities': model_info['capabilities'],
                    'type': model_info.get('type', 'text')
                }
                for model_id, model_info in available_models.items()
            ],
            'preferred_model': preferred_model,
            'maxTokens': 2000,
            'temperature': 0.7,
            'apiKeyConfigured': bool(os.getenv('OPENAI_API_KEY'))
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get config'}), 500

@openai_bp.route('/models', methods=['GET'])
@jwt_required()
def get_models_endpoint():
    """Get all available AI models"""
    try:
        available_models = get_cached_models()
        return jsonify({
            'models': available_models,
            'total': len(available_models)
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get models'}), 500

@openai_bp.route('/models/switch', methods=['POST'])
@jwt_required()
def switch_model():
    """Switch user's preferred AI model"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or not data.get('model_id'):
            return jsonify({'error': 'Model ID is required'}), 400
        
        model_id = data['model_id']
        
        # Validate model
        available_models = get_cached_models()
        if model_id not in available_models:
            return jsonify({'error': 'Invalid model ID'}), 400
        
        # Update user's preferred model
        user = User.query.get(user_id)
        user.preferred_ai_model = model_id
        db.session.commit()
        
        # Send real-time update
        from app.services.realtime_service import get_realtime_service
        realtime_service = get_realtime_service()
        if realtime_service:
            realtime_service.send_ai_model_update(user_id, {
                'model_id': model_id,
                'model_name': available_models[model_id]['name'],
                'provider': available_models[model_id]['provider']
            })
        
        return jsonify({
            'message': 'Model switched successfully',
            'model_id': model_id,
            'model_name': AVAILABLE_MODELS[model_id]['name']
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to switch model'}), 500

@openai_bp.route('/models/compare', methods=['POST'])
@jwt_required()
def compare_models():
    """Compare responses from different AI models"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or not data.get('prompt'):
            return jsonify({'error': 'Prompt is required'}), 400
        
        prompt = data['prompt']
        models_to_compare = data.get('models', ['gpt-4', 'gpt-3.5-turbo'])
        
        # Validate models
        for model_id in models_to_compare:
            if model_id not in AVAILABLE_MODELS:
                return jsonify({'error': f'Invalid model: {model_id}'}), 400
        
        results = []
        
        # Use AIService which fetches keys from MySQL in realtime
        from app.services.ai_service import get_ai_service
        ai_service = get_ai_service()
        
        for model_id in models_to_compare:
            try:
                # Call AI service
                result = ai_service.chat_completion(
                    messages=[{"role": "user", "content": prompt}],
                    model=model_id,
                    temperature=0.7,
                    max_tokens=1000
                )
                
                ai_response = result.get('text', '')
                usage = result.get('usage', {})
                tokens_used = usage.get('total_tokens', 0)
                
                results.append({
                    'model_id': model_id,
                    'model_name': AVAILABLE_MODELS.get(model_id, {}).get('name', model_id),
                    'response': ai_response,
                    'tokens_used': tokens_used,
                    'cost': tokens_used * AVAILABLE_MODELS.get(model_id, {}).get('cost_per_1k_tokens', 0) / 1000,
                    'success': True
                })
                
            except Exception as e:
                results.append({
                    'model_id': model_id,
                    'model_name': AVAILABLE_MODELS.get(model_id, {}).get('name', model_id),
                    'error': str(e),
                    'success': False
                })
        
        return jsonify({
            'prompt': prompt,
            'results': results,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to compare models'}), 500

@openai_bp.route('/usage', methods=['GET'])
@jwt_required()
def get_usage():
    """Get AI usage statistics"""
    try:
        user_id = get_jwt_identity()
        
        # Get today's usage
        today = datetime.utcnow().date()
        today_usage = AIUsageLog.query.filter(
            AIUsageLog.user_id == user_id,
            db.func.date(AIUsageLog.timestamp) == today
        ).all()
        
        # Get this month's usage
        month_start = datetime.utcnow().replace(day=1).date()
        month_usage = AIUsageLog.query.filter(
            AIUsageLog.user_id == user_id,
            db.func.date(AIUsageLog.timestamp) >= month_start
        ).all()
        
        # Calculate totals
        tokens_today = sum(log.total_tokens for log in today_usage)
        tokens_month = sum(log.total_tokens for log in month_usage)
        cost_today = sum(log.cost for log in today_usage)
        cost_month = sum(log.cost for log in month_usage)
        requests_today = len(today_usage)
        
        return jsonify({
            'tokensUsedToday': tokens_today,
            'tokensUsedMonth': tokens_month,
            'costToday': cost_today,
            'costMonth': cost_month,
            'requestsToday': requests_today,
            'quotaRemaining': 10000 - tokens_month  # Example quota
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get usage statistics'}), 500


def _route_chat_completion(model: str, messages: list, temperature: float = 0.7, max_tokens: int = 1000) -> dict:
    """Route chat completion to the correct provider based on model id.
    
    Uses AIService to fetch API keys from MySQL database in realtime.
    """
    from app.services.ai_service import get_ai_service
    
    # Use AIService which fetches keys from MySQL in realtime
    ai_service = get_ai_service()
    
    # Get dynamic models
    available_models = get_cached_models()
    provider = available_models.get(model, {}).get('provider')
    
    # Heuristics for fallback
    if not provider:
        if model.startswith('ollama/'):
            provider = 'ollama'
        elif model.startswith('gpt-'):
            provider = 'openai'
        elif model.startswith('claude-'):
            provider = 'anthropic'
        elif model.startswith('llama') or model.startswith('mixtral'):
            provider = 'groq'
        else:
            provider = 'openai'  # Default fallback

    # Use AIService for all providers - it handles key fetching from MySQL
    try:
        result = ai_service.chat_completion(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens
        )
        return result
    except Exception as e:
        logger.error(f"Error in chat completion: {e}")
        # Fallback to direct API calls if AIService fails (for backward compatibility)
        if provider == 'openai':
            api_key = ai_service.get_api_key_for_provider('openai') or OPENAI_API_KEY_ENV
            if not api_key:
                raise OpenAIError('OpenAI API key not configured')
            client = create_openai_client_safe(api_key=api_key)
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            return {
                'text': resp.choices[0].message.content,
                'usage': {
                    'prompt_tokens': getattr(resp.usage, 'prompt_tokens', 0),
                    'completion_tokens': getattr(resp.usage, 'completion_tokens', 0),
                    'total_tokens': getattr(resp.usage, 'total_tokens', 0)
                }
            }
        elif provider == 'groq':
            api_key = ai_service.get_api_key_for_provider('groq') or GROQ_API_KEY
            if not api_key:
                raise OpenAIError('Groq API key not configured')
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
            r = requests.post(url, headers=headers, json=payload, timeout=60)
            r.raise_for_status()
            data = r.json()
            usage = data.get('usage', {})
            return {
                'text': data['choices'][0]['message']['content'],
                'usage': {
                    'prompt_tokens': usage.get('prompt_tokens', 0),
                    'completion_tokens': usage.get('completion_tokens', 0),
                    'total_tokens': usage.get('total_tokens', 0)
                }
            }
        elif provider == 'ollama':
            # Ollama doesn't need API keys
            local_model = model.split('/', 1)[1] if '/' in model else model
            url = f'{OLLAMA_BASE_URL}/api/chat'
            payload = {
                'model': local_model,
                'messages': [{'role': m.get('role', 'user'), 'content': m['content']} for m in messages],
                'options': {
                    'temperature': temperature
                }
            }
            r = requests.post(url, json=payload, timeout=120)
            r.raise_for_status()
            data = r.json()
            text = ''
            if isinstance(data, dict):
                text = data.get('message', {}).get('content', '') or data.get('response', '')
            return {
                'text': text,
                'usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
            }
        else:
            raise OpenAIError(f'Unsupported provider: {provider}')


@openai_bp.route('/proxy-chat', methods=['POST'])
@jwt_required()
def proxy_chat():
    """Unified chat endpoint that routes to OpenAI, Groq, or Ollama based on model id.

    Body: { model: string, messages: [{role, content}], temperature?, maxTokens?, toolPath? }
    """
    try:
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        tool_path = data.get('toolPath')  # Optional: path of the tool making the request
        
        # Resolve model from tool path if provided, otherwise use provided model
        if tool_path:
            from app.utils.tool_model_resolver import resolve_tool_model
            resolved_model, _ = resolve_tool_model(tool_path)
            model = data.get('model') or resolved_model
        else:
            model = data.get('model') or 'gpt-3.5-turbo'
        
        messages = data.get('messages') or [{'role': 'user', 'content': data.get('prompt', '')}]
        temperature = float(data.get('temperature', 0.7))
        max_tokens = int(data.get('maxTokens', 1000))

        # Check usage limits if tool path is provided
        user_limit = None
        if tool_path:
            from app.utils.ai_limits_helper import check_tool_limit_by_path
            can_use, message, user_limit = check_tool_limit_by_path(user_id, tool_path)
            if not can_use:
                from app.errors import AuthorizationError
                raise AuthorizationError(message)

        result = _route_chat_completion(model, messages, temperature, max_tokens)

        # Log minimal usage
        usage_total = result.get('usage', {}).get('total_tokens', 0)
        ai_log = AIUsageLog(
            user_id=user_id,
            endpoint='proxy-chat',
            model=model,
            model_name=model,  # Set model_name to same as model
            request_tokens=result.get('usage', {}).get('prompt_tokens', 0),
            response_tokens=result.get('usage', {}).get('completion_tokens', 0),
            total_tokens=usage_total,
            cost=(usage_total * AVAILABLE_MODELS.get(model, {}).get('cost_per_1k_tokens', 0) / 1000.0),
            request_data={'messages': messages[:1]},
            response_data={'text': result.get('text', '')[:200]}
        )
        db.session.add(ai_log)
        
        # Increment tool usage if tool path was provided and limit was checked
        if tool_path and user_limit:
            from app.utils.ai_limits_helper import increment_tool_usage
            increment_tool_usage(user_id, user_limit.tool_id)
        
        db.session.commit()

        return jsonify({
            'model': model,
            'text': result['text'],
            'usage': result.get('usage', {})
        }), 200

    except (ValidationError, OpenAIError) as e:
        logger.error(f"Error in proxy_chat: {e}", exc_info=True)
        return jsonify({'error': str(e)}), e.status_code if hasattr(e, 'status_code') else 400
    except Exception as e:
        # Log full error details for debugging
        error_msg = str(e)
        logger.error(f"Error in proxy_chat: {error_msg}", exc_info=True)
        
        # Return detailed error in development, generic in production
        if os.getenv('FLASK_ENV') == 'development':
            return jsonify({
                'error': f'Failed to process chat request: {error_msg}',
                'type': type(e).__name__
            }), 500
        else:
            return jsonify({'error': 'Failed to process chat request'}), 500

@openai_bp.route('/test-prompt', methods=['POST'])
@jwt_required()
def test_prompt():
    """Test a prompt with AI models - uses AIService to fetch keys from MySQL in realtime"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or not data.get('prompt'):
            raise ValidationError('Prompt is required')
        
        prompt = data['prompt']
        model = data.get('model', 'gpt-4')
        temperature = data.get('temperature', 0.7)
        max_tokens = data.get('maxTokens', 2000)
        
        # Check AI usage limits
        from app.utils.ai_limits import check_user_ai_limits, check_system_ai_limits, estimate_cost
        
        estimated_tokens = len(prompt.split()) * 1.5 + max_tokens  # Rough estimate
        estimated_cost = estimate_cost(model, estimated_tokens)
        
        # Check user limits
        check_user_ai_limits(user_id, estimated_tokens, estimated_cost)
        
        # Check system limits
        check_system_ai_limits()
        
        # Use AIService which fetches keys from MySQL in realtime
        from app.services.ai_service import get_ai_service
        ai_service = get_ai_service()
        
        # Call AI service
        result = ai_service.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            model=model,
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        # Extract response
        ai_response = result.get('text', '')
        usage = result.get('usage', {})
        tokens_used = usage.get('total_tokens', 0)
        
        # Log usage
        usage_log = AIUsageLog(
            user_id=user_id,
            endpoint='test-prompt',
            model=model,
            model_name=model,  # Set model_name to same as model
            request_tokens=usage.get('prompt_tokens', 0),
            response_tokens=usage.get('completion_tokens', 0),
            total_tokens=tokens_used,
            cost=tokens_used * 0.00003,  # Approximate cost
            request_data={'prompt': prompt, 'temperature': temperature},
            response_data={'response': ai_response}
        )
        db.session.add(usage_log)
        db.session.commit()
        
        return jsonify({
            'response': ai_response,
            'tokensUsed': tokens_used,
            'model': model,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
        
    except (ValidationError, OpenAIError) as e:
        logger.error(f"Error in test_prompt (validation): {e}", exc_info=True)
        return jsonify({'error': str(e)}), e.status_code if hasattr(e, 'status_code') else 400
    except Exception as e:
        # Log full error details for debugging
        error_msg = str(e)
        logger.error(f"Error in test_prompt: {error_msg}", exc_info=True)
        
        # Return detailed error in development, generic in production
        if os.getenv('FLASK_ENV') == 'development':
            return jsonify({
                'error': f'Failed to test prompt: {error_msg}',
                'type': type(e).__name__
            }), 500
        else:
            return jsonify({'error': 'Failed to test prompt'}), 500

@openai_bp.route('/grade-prompt', methods=['POST'])
@jwt_required()
def grade_prompt():
    """Grade a prompt using AI"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or not data.get('prompt'):
            raise ValidationError('Prompt is required')
        
        prompt = data['prompt']
        criteria = data.get('criteria', [])
        rubric = data.get('rubric', {})
        
        # Create grading prompt
        grading_prompt = f"""
        Please grade the following prompt based on the criteria provided.
        
        Prompt to grade: {prompt}
        
        Criteria: {', '.join(criteria) if criteria else 'General prompt quality'}
        
        Please provide:
        1. A score from 0-100
        2. Detailed feedback
        3. Specific suggestions for improvement
        4. A breakdown of how the prompt performs on each criterion
        
        Format your response as JSON with the following structure:
        {{
            "score": 85,
            "feedback": "Your feedback here",
            "suggestions": ["suggestion1", "suggestion2"],
            "breakdown": {{"criterion1": "assessment", "criterion2": "assessment"}}
        }}
        """
        
        # Use AIService which fetches keys from MySQL in realtime
        from app.services.ai_service import get_ai_service
        ai_service = get_ai_service()
        
        # Call AI service
        result = ai_service.chat_completion(
            messages=[{"role": "user", "content": grading_prompt}],
            model='gpt-4',
            temperature=0.3,
            max_tokens=1000
        )
        
        # Parse response
        ai_response = result.get('text', '')
        usage = result.get('usage', {})
        tokens_used = usage.get('total_tokens', 0)
        
        # Try to parse JSON response
        try:
            import json
            grading_result = json.loads(ai_response)
        except:
            # Fallback if JSON parsing fails
            grading_result = {
                'score': 75,
                'feedback': ai_response,
                'suggestions': ['Review the prompt structure', 'Add more specific details'],
                'breakdown': {'clarity': 'Good', 'specificity': 'Needs improvement'}
            }
        
        # Save grading result
        prompt_grading = PromptGradingResult(
            user_id=user_id,
            prompt=prompt,
            score=grading_result['score'],
            feedback=grading_result['feedback'],
            suggestions=grading_result['suggestions'],
            breakdown=grading_result['breakdown'],
            criteria_used=criteria,
            model_used='gpt-4'
        )
        db.session.add(prompt_grading)
        
        # Log usage
        usage_log = AIUsageLog(
            user_id=user_id,
            endpoint='grade-prompt',
            model='gpt-4',
            model_name='gpt-4',  # Set model_name to same as model
            request_tokens=usage.get('prompt_tokens', 0),
            response_tokens=usage.get('completion_tokens', 0),
            total_tokens=tokens_used,
            cost=tokens_used * 0.00003,
            request_data={'prompt': prompt, 'criteria': criteria},
            response_data=grading_result
        )
        db.session.add(usage_log)
        db.session.commit()
        
        return APIResponse.success(
            data={
                'score': grading_result.get('score', 0) / 10,  # Convert 0-100 to 0-10 scale
                'feedback': grading_result.get('feedback', ''),
                'suggestions': grading_result.get('suggestions', []),
                'breakdown': grading_result.get('breakdown', {})
            },
            message="Prompt graded successfully"
        )
        
    except (ValidationError, OpenAIError) as e:
        return APIResponse.error(
            message=str(e),
            status_code=e.status_code if hasattr(e, 'status_code') else 400,
            error_code="VALIDATION_ERROR" if isinstance(e, ValidationError) else "AI_SERVICE_ERROR"
        )
    except Exception as e:
        logger.error(f"Error grading prompt: {e}", exc_info=True)
        return APIResponse.error(
            message="Failed to grade prompt",
            status_code=500,
            error_code="PROMPT_GRADING_ERROR"
        )

@openai_bp.route('/translate-prompt', methods=['POST'])
@jwt_required()
def translate_prompt():
    """Translate a prompt between AI models"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or not data.get('prompt'):
            raise ValidationError('Prompt is required')
        
        prompt = data['prompt']
        source_model = data.get('sourceModel', 'gpt-3.5-turbo')
        target_model = data.get('targetModel', 'gpt-4')
        tool_path = data.get('toolPath', '/prompt-translator')  # Default to prompt translator tool
        
        # Resolve model from tool path
        from app.utils.tool_model_resolver import resolve_tool_model
        resolved_model, _ = resolve_tool_model(tool_path)
        
        # Create translation prompt
        translation_prompt = f"""
        Translate this prompt from {source_model} to {target_model} format.
        
        Original prompt: {prompt}
        
        Please provide:
        1. The translated prompt optimized for {target_model}
        2. An explanation of the changes made
        3. Tips for using the prompt with {target_model}
        
        Format your response as JSON:
        {{
            "translatedPrompt": "translated prompt here",
            "explanation": "explanation of changes",
            "tips": ["tip1", "tip2"]
        }}
        """
        
        # Use AIService which fetches keys from MySQL in realtime
        from app.services.ai_service import get_ai_service
        ai_service = get_ai_service()
        
        # Call AI service using resolved model
        result = ai_service.translate_prompt(
            prompt=translation_prompt,
            source_model=source_model,
            target_model=target_model,
            tool_path=tool_path
        )
        
        # Parse response - translate_prompt already returns structured data
        translated_data = result
        usage = translated_data.get('usage', {})
        tokens_used = usage.get('total_tokens', 0)
        
        # translate_prompt already returns structured data
        translation_result = {
            'translatedPrompt': translated_data.get('translated_prompt', prompt),
            'explanation': translated_data.get('explanation', 'Translation completed'),
            'tips': translated_data.get('tips', ['Use the prompt as-is', 'Adjust temperature as needed'])
        }
        
        # Save to translation history
        from app.models.translations import TranslationHistory
        
        translation_history = TranslationHistory(
            user_id=user_id,
            original_prompt=prompt,
            translated_prompt=translation_result.get('translatedPrompt', prompt),
            source_model=source_model,
            target_model=target_model,
            explanation=translation_result.get('explanation', ''),
            tips=translation_result.get('tips', []),
            tokens_used=tokens_used,
            cost=tokens_used * 0.00003
        )
        db.session.add(translation_history)
        
        # Log usage
        usage_log = AIUsageLog(
            user_id=user_id,
            endpoint='translate-prompt',
            model=resolved_model,
            model_name=resolved_model,  # Set model_name to same as model
            request_tokens=usage.get('prompt_tokens', 0),
            response_tokens=usage.get('completion_tokens', 0),
            total_tokens=tokens_used,
            cost=tokens_used * 0.00003,
            request_data={'prompt': prompt, 'sourceModel': source_model, 'targetModel': target_model},
            response_data=translation_result
        )
        db.session.add(usage_log)
        db.session.commit()
        
        # Include history ID in response
        translation_result['history_id'] = translation_history.id
        
        return APIResponse.success(
            data={
                'translated_prompt': translation_result.get('translatedPrompt', prompt),
                'explanation': translation_result.get('explanation', ''),
                'tips': translation_result.get('tips', []),
                'history_id': translation_history.id
            },
            message="Prompt translated successfully"
        )
        
    except (ValidationError, OpenAIError) as e:
        return APIResponse.error(
            message=str(e),
            status_code=e.status_code if hasattr(e, 'status_code') else 400,
            error_code="VALIDATION_ERROR" if isinstance(e, ValidationError) else "AI_SERVICE_ERROR"
        )
    except Exception as e:
        # Log full error details for debugging
        error_msg = str(e)
        logger.error(f"Error translating prompt: {error_msg}", exc_info=True)
        
        # Return detailed error in development, generic in production
        if os.getenv('FLASK_ENV') == 'development':
            return APIResponse.error(
                message=f"Failed to translate prompt: {error_msg}",
                status_code=500,
                error_code="PROMPT_TRANSLATION_ERROR"
            )
        else:
            return APIResponse.error(
                message="Failed to translate prompt",
                status_code=500,
                error_code="PROMPT_TRANSLATION_ERROR"
            )

@openai_bp.route('/generate-image', methods=['POST'])
@jwt_required()
def generate_image():
    """Generate an image from text prompt"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or not data.get('prompt'):
            raise ValidationError('Prompt is required')
        
        prompt = data['prompt']
        style = data.get('style', 'realistic')
        size = data.get('size', '1024x1024')
        quality = data.get('quality', 'standard')
        tool_path = data.get('toolPath', '/image-prompt-mastery')  # Default to image prompts tool
        
        # Resolve model from tool path (for image generation, usually dall-e-3)
        from app.utils.tool_model_resolver import resolve_tool_model
        resolved_model, _ = resolve_tool_model(tool_path)
        
        # For image generation, use resolved model or default to dall-e-3
        image_model = resolved_model if 'dall-e' in resolved_model.lower() or 'midjourney' in resolved_model.lower() else 'dall-e-3'
        
        # Use AIService which fetches keys from MySQL in realtime
        from app.services.ai_service import get_ai_service
        ai_service = get_ai_service()
        
        # Call AI service for image generation
        result = ai_service.generate_image(
            prompt=prompt,
            model=image_model,
            size=size,
            quality=quality,
            style=style
        )
        
        image_url = result.get('image_url', '')
        
        # Log usage
        usage_log = AIUsageLog(
            user_id=user_id,
            endpoint='generate-image',
            model=image_model,
            model_name=image_model,  # Set model_name to same as model
            total_tokens=0,  # DALL-E doesn't use tokens
            cost=0.04,  # Approximate cost for DALL-E
            request_data={'prompt': prompt, 'style': style, 'size': size},
            response_data={'image_url': image_url}
        )
        db.session.add(usage_log)
        db.session.commit()
        
        return jsonify({
            'imageUrl': image_url,
            'prompt': prompt,
            'model': image_model,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
        
    except (ValidationError, OpenAIError) as e:
        logger.error(f"Image generation validation error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), e.status_code if hasattr(e, 'status_code') else 400
    except Exception as e:
        # Log full error details for debugging
        error_msg = str(e)
        logger.error(f"Image generation failed: {error_msg}", exc_info=True)
        
        # Return detailed error in development, generic in production
        import os
        if os.getenv('FLASK_ENV') == 'development':
            return jsonify({
                'error': 'Failed to generate image',
                'details': error_msg,
                'type': type(e).__name__
            }), 500
        else:
            return jsonify({'error': 'Failed to generate image'}), 500

@openai_bp.route('/generate-code', methods=['POST'])
@jwt_required()
def generate_code():
    """Generate code from natural language"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or not data.get('prompt'):
            raise ValidationError('Prompt is required')
        
        prompt = data['prompt']
        language = data.get('language', 'python')
        framework = data.get('framework', '')
        tool_path = data.get('toolPath', '/code-generation-workshop')  # Default to code workshop tool
        
        # Resolve model from tool path
        from app.utils.tool_model_resolver import resolve_tool_model
        resolved_model, _ = resolve_tool_model(tool_path)
        
        # Create code generation prompt
        code_prompt = f"""
        Generate {language} code based on the following description:
        
        {prompt}
        
        {f'Use {framework} framework if applicable.' if framework else ''}
        
        Please provide:
        1. The complete code
        2. A brief explanation of what the code does
        3. Any important notes or considerations
        
        Format your response as JSON:
        {{
            "code": "generated code here",
            "explanation": "explanation of the code",
            "language": "{language}",
            "notes": ["note1", "note2"]
        }}
        """
        
        # Use AIService which fetches keys from MySQL in realtime
        from app.services.ai_service import get_ai_service
        ai_service = get_ai_service()
        
        # Call AI service for code generation
        result = ai_service.generate_code(
            prompt=prompt,
            language=language,
            framework=framework,
            tool_path=tool_path
        )
        
        # Parse response - generate_code already returns structured data
        code_result = {
            'code': result.get('code', ''),
            'explanation': result.get('explanation', 'Generated code'),
            'language': result.get('language', language),
            'notes': result.get('notes', ['Review the code before use'])
        }
        
        usage = result.get('usage', {})
        tokens_used = usage.get('total_tokens', 0)
        
        # Log usage
        usage_log = AIUsageLog(
            user_id=user_id,
            endpoint='generate-code',
            model=resolved_model,
            model_name=resolved_model,  # Set model_name to same as model
            request_tokens=usage.get('prompt_tokens', 0),
            response_tokens=usage.get('completion_tokens', 0),
            total_tokens=tokens_used,
            cost=tokens_used * 0.00003,
            request_data={'prompt': prompt, 'language': language, 'framework': framework},
            response_data=code_result
        )
        db.session.add(usage_log)
        db.session.commit()
        
        return jsonify(code_result), 200
        
    except (ValidationError, OpenAIError) as e:
        logger.error(f"Error in generate_code (validation): {e}", exc_info=True)
        return jsonify({'error': str(e)}), e.status_code if hasattr(e, 'status_code') else 400
    except Exception as e:
        # Log full error details for debugging
        error_msg = str(e)
        logger.error(f"Error in generate_code: {error_msg}", exc_info=True)
        
        # Return detailed error in development, generic in production
        if os.getenv('FLASK_ENV') == 'development':
            return jsonify({
                'error': f'Failed to generate code: {error_msg}',
                'type': type(e).__name__
            }), 500
        else:
            return jsonify({'error': 'Failed to generate code'}), 500

@openai_bp.route('/reset-ai-service', methods=['POST'])
@jwt_required()
@require_admin
def reset_ai_service():
    """Reset AIService singleton to force code reload (admin only)"""
    try:
        from app.services.ai_service import reset_ai_service
        reset_ai_service()
        return jsonify({
            'message': 'AIService singleton reset successfully',
            'success': True
        }), 200
    except Exception as e:
        logger.error(f"Error resetting AIService: {e}", exc_info=True)
        return jsonify({
            'error': f'Failed to reset AIService: {str(e)}',
            'success': False
        }), 500

@openai_bp.route('/translation-history', methods=['GET'])
@jwt_required()
def get_translation_history():
    """Get user's translation history"""
    try:
        user_id = get_jwt_identity()
        limit = request.args.get('limit', 50, type=int)
        
        from app.models.translations import TranslationHistory
        
        history = TranslationHistory.query.filter_by(user_id=user_id)\
            .order_by(TranslationHistory.created_at.desc())\
            .limit(limit).all()
        
        return jsonify({
            'history': [h.to_dict() for h in history],
            'total': len(history)
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get translation history'}), 500

@openai_bp.route('/translation-history/<int:history_id>', methods=['DELETE'])
@jwt_required()
def delete_translation_history(history_id):
    """Delete a translation from history"""
    try:
        user_id = get_jwt_identity()
        
        from app.models.translations import TranslationHistory
        
        history = TranslationHistory.query.filter_by(
            id=history_id,
            user_id=user_id
        ).first()
        
        if not history:
            return jsonify({'error': 'Translation not found'}), 404
        
        db.session.delete(history)
        db.session.commit()
        
        return jsonify({'message': 'Translation deleted successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to delete translation'}), 500

@openai_bp.route('/translation-history/<int:history_id>/rate', methods=['PUT'])
@jwt_required()
def rate_translation(history_id):
    """Rate a translation"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'rating' not in data:
            return jsonify({'error': 'Rating is required'}), 400
        
        rating = data['rating']
        if not isinstance(rating, int) or rating < 1 or rating > 5:
            return jsonify({'error': 'Rating must be between 1 and 5'}), 400
        
        from app.models.translations import TranslationHistory
        
        history = TranslationHistory.query.filter_by(
            id=history_id,
            user_id=user_id
        ).first()
        
        if not history:
            return jsonify({'error': 'Translation not found'}), 404
        
        history.rating = rating
        history.is_favorite = data.get('is_favorite', history.is_favorite)
        history.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'message': 'Rating saved successfully',
            'translation': history.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to rate translation'}), 500
