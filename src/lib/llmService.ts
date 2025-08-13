import { type AIAgent } from '@/config/aiAgents';

export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LLMService {
  private static instance: LLMService;
  
  static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  async generateContent(
    agent: AIAgent,
    prompt: string,
    context?: any
  ): Promise<LLMResponse> {
    // Try providers in order of preference
    const providers = [
      { name: 'openai', method: this.callOpenAI },
      { name: 'anthropic', method: this.callAnthropic },
      { name: 'groq', method: this.callGroq }
    ];

    for (const provider of providers) {
      try {
        const result = await provider.method.call(this, agent, prompt, context);
        if (result) {
          return result;
        }
      } catch (error) {
        console.warn(`${provider.name} API failed:`, error);
        continue;
      }
    }

    throw new Error('All LLM providers failed');
  }

  private async callOpenAI(
    agent: AIAgent,
    prompt: string,
    context?: any
  ): Promise<LLMResponse | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `${agent.systemPrompt}\n\nIMPORTANT: Keep responses under ${agent.maxTokens} characters. Write as ${agent.name} (${agent.username}) in their unique style.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: Math.min(agent.maxTokens, 280),
        temperature: agent.temperature,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0].message.content.trim(),
      usage: data.usage
    };
  }

  private async callAnthropic(
    agent: AIAgent,
    prompt: string,
    context?: any
  ): Promise<LLMResponse | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: Math.min(agent.maxTokens, 1000),
        temperature: agent.temperature,
        system: `${agent.systemPrompt}

IMPORTANT: You are creating content for a fantasy football social media feed. Keep posts:
- Under ${agent.maxTokens} characters (think Twitter-length)
- Engaging and entertaining
- True to your personality
- Include relevant hashtags when appropriate
- Focus on fantasy football insights, not general NFL commentary

Write as ${agent.name} (${agent.username}) in their unique voice and style.`,
        messages: [
          {
            role: 'user',
            content: `${prompt}

Generate a social media post that fits ${agent.name}'s personality perfectly. Make it feel authentic and engaging for fantasy football managers.`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let content = data.content[0]?.text?.trim() || '';
    
    // Clean up the content - remove quotes if wrapped
    if ((content.startsWith('"') && content.endsWith('"')) ||
        (content.startsWith("'") && content.endsWith("'"))) {
      content = content.slice(1, -1);
    }
    
    return {
      content,
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }
    };
  }

  private async callGroq(
    agent: AIAgent,
    prompt: string,
    context?: any
  ): Promise<LLMResponse | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: `${agent.systemPrompt}\n\nIMPORTANT: Keep responses under ${agent.maxTokens} characters. Write as ${agent.name} (${agent.username}) in their unique style.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: Math.min(agent.maxTokens, 280),
        temperature: agent.temperature
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0].message.content.trim(),
      usage: data.usage
    };
  }
}

export const llmService = LLMService.getInstance();