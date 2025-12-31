import apiService from '@/lib/api';
import { getSkillProgress } from '@/lib/skillTracker';

export type Recommendation = {
  id: string;
  kind: 'topic' | 'module' | 'lesson' | 'practice';
  title: string;
  reason: string;
  score: number;
  meta?: any;
};

function scoreBySkillGap(skills: Record<string, number>, tags: string[]): number {
  const focus = ['clarity', 'specificity', 'context', 'structure'] as const;
  const gaps = focus.map(k => (100 - (skills[k] || 50)) / 100);
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const tagBoost = tags?.length ? 0.1 : 0;
  return Math.min(1, Math.max(0, avgGap + tagBoost));
}

export async function getRecommendations(): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];
  const skills = getSkillProgress().current as any;

  // Load topics and pick top by interest match + skill gap
  const topics = await apiService.getTopics();
  const userSettings = await (apiService as any).getUserSettings?.().catch?.(() => null);
  const interests: string[] = userSettings?.preferences?.interests || [];

  const topicArray = Array.isArray(topics) ? topics : (topics?.topics || []);
  for (const t of topicArray) {
    const name = t.title || t.name || '';
    const interestMatch = interests.some(i => name.toLowerCase().includes(String(i).toLowerCase())) ? 0.3 : 0;
    const s = scoreBySkillGap(skills, t.tags || []);
    const score = s + interestMatch;
    recs.push({ id: String(t.id), kind: 'topic', title: name, score, reason: interestMatch ? 'Matches your interests and addresses skill gaps' : 'Addresses skill gaps', meta: t });
  }

  // Load modules for top topic
  const topTopic = recs.filter(r => r.kind === 'topic').sort((a, b) => b.score - a.score)[0];
  if (topTopic?.id) {
    const modulesResp = await apiService.getModules(topTopic.id);
    const modules = (modulesResp as any)?.items || (modulesResp as any)?.modules || [];
    for (const m of modules) {
      const score = scoreBySkillGap(skills, m.tags || []);
      recs.push({ id: String(m.id), kind: 'module', title: m.title, score, reason: 'Module aligned to your weakest skills', meta: m });
    }
  }

  return recs.sort((a, b) => b.score - a.score).slice(0, 12);
}



