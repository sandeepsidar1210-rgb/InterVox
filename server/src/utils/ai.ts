import fetch from 'node-fetch';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const openai = {
  chat: {
    completions: {
      create: async (params: {
        model: string;
        messages: ChatMessage[];
        max_tokens?: number;
        temperature?: number;
        response_format?: { type: 'json_object' };
      }) => {
        const apiKey = process.env.OPENAI_API_KEY || '';
        if (!apiKey || apiKey === 'your-openai-api-key-here') {
          console.warn('⚠️ No OpenAI API key configured - returning empty fallback mock');
          return {
            choices: [
              {
                message: {
                  content: '{}'
                }
              }
            ]
          };
        }

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: params.model,
            messages: params.messages,
            max_tokens: params.max_tokens,
            temperature: params.temperature,
            response_format: params.response_format
          })
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`OpenAI API failed with status ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        return {
          choices: [
            {
              message: {
                content: data.choices?.[0]?.message?.content || '{}'
              }
            }
          ]
        };
      }
    }
  }
};

export const groq = {
  chat: {
    completions: {
      create: async (params: {
        model: string;
        messages: ChatMessage[];
        max_tokens?: number;
        temperature?: number;
        response_format?: { type: 'json_object' };
      }) => {
        const apiKey = process.env.GROQ_API_KEY || '';
        if (!apiKey || apiKey === 'your-groq-api-key-here') {
          console.warn('⚠️ No Groq API key configured - returning empty fallback mock');
          return {
            choices: [
              {
                message: {
                  content: '{"questions":[]}'
                }
              }
            ]
          };
        }

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: params.model,
            messages: params.messages,
            max_tokens: params.max_tokens,
            temperature: params.temperature,
            response_format: params.response_format
          })
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Groq API failed with status ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        return {
          choices: [
            {
              message: {
                content: data.choices?.[0]?.message?.content || ''
              }
            }
          ]
        };
      }
    }
  }
};
