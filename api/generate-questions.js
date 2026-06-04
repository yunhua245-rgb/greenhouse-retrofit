// Vercel Serverless Function — Generate smart questions for missing project info
// Uses DeepSeek AI to create multiple-choice questions based on missing slots

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { missingSlots, existingInfo, lang } = req.body || {};
  if (!missingSlots || missingSlots.length === 0) {
    return res.status(400).json({ error: 'No missing slots provided' });
  }

  const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com';
  const AI_API_KEY = process.env.AI_API_KEY || 'sk-f2a6af8a39d848a5ade70105fb27c208';
  const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat';

  // Map slot keys to human-readable descriptions
  const slotDescriptions = {
    area: { zh: '温室面积', en: 'Greenhouse area', ru: 'Площадь теплицы' },
    structureType: { zh: '温室结构类型', en: 'Greenhouse structure type', ru: 'Тип конструкции' },
    infrastructure: { zh: '现有基础设施', en: 'Existing infrastructure', ru: 'Существующая инфраструктура' },
    crops: { zh: '种植作物', en: 'Current crops', ru: 'Выращиваемые культуры' },
    scope: { zh: '需要自动化的系统', en: 'Systems to automate', ru: 'Системы для автоматизации' },
    budget: { zh: '预算范围', en: 'Budget range', ru: 'Диапазон бюджета' },
    timeline: { zh: '期望完成时间', en: 'Preferred timeline', ru: 'Желаемые сроки' }
  };

  const langName = { en: 'English', ru: 'Russian', zh: 'Chinese' }[lang] || 'English';

  // Build context about what we already know
  let contextStr = '';
  if (existingInfo && Object.keys(existingInfo).length > 0) {
    contextStr = '\n\nAlready known project info:\n' + Object.entries(existingInfo)
      .filter(([k, v]) => v)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
  }

  // Only ask about first 2-3 missing slots at a time to not overwhelm
  const slotsToAsk = missingSlots.slice(0, 3);

  const systemPrompt = `You are helping a greenhouse owner provide project information for an automation retrofit. 
Generate multiple-choice questions to collect missing information.

Rules:
- Output STRICTLY valid JSON array, nothing else
- Each question object: {"slot": "slotKey", "question": "...", "options": ["A", "B", "C", "D"]}
- Questions should be in ${langName}
- Options should be realistic, practical choices for a greenhouse project
- 4 options per question
- Options should be concise (under 30 chars each)
- Make questions conversational and friendly
- Consider the context of an existing greenhouse being retrofitted with automation${contextStr}`;

  const userMsg = `Generate questions for these missing fields:\n${slotsToAsk.map(s => `- ${s} (${(slotDescriptions[s] || {})[lang] || s})`).join('\n')}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(AI_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_API_KEY
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg }
        ],
        max_tokens: 800,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(502).json({ error: 'AI request failed', status: response.status, detail: errText.substring(0, 200) });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const questions = JSON.parse(jsonMatch[0]);
        return res.status(200).json({ success: true, questions });
      } catch(e) {
        return res.status(200).json({ success: false, error: 'Failed to parse AI response', raw: content });
      }
    }

    return res.status(200).json({ success: false, error: 'No valid JSON in response', raw: content });

  } catch (e) {
    return res.status(500).json({ error: 'AI call failed', detail: e.message || String(e) });
  }
};
