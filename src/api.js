import Anthropic from '@anthropic-ai/sdk';
import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import OpenAI from 'openai';

let client;
let totalInput = 0;
let totalOutput = 0;
let vertexConfig = null;
let bedrockConfig = null;
let openrouterConfig = null;

/**
 * Configure the API client to use Vertex AI.
 * Must be called before any API calls if Vertex is desired.
 * @param {{ projectId: string, region?: string }} config
 */
export function configureVertex(config) {
  vertexConfig = config;
  bedrockConfig = null;
  client = null; // reset so next getClient() picks up the new config
}

/**
 * Configure the API client to use AWS Bedrock.
 * Must be called before any API calls if Bedrock is desired.
 * Credentials come from the standard AWS credential chain
 * (env vars, ~/.aws/credentials, SSO, IMDS).
 * @param {{ region?: string }} config
 */
export function configureBedrock(config) {
  bedrockConfig = config ?? {};
  vertexConfig = null;
  openrouterConfig = null;
  client = null;
}

export function configureOpenRouter(config) {
  openrouterConfig = config ?? {};
  vertexConfig = null;
  bedrockConfig = null;
  client = null;
}

function getClient() {
  if (!client) {
    if (vertexConfig) {
      client = new AnthropicVertex({
        projectId: vertexConfig.projectId,
        region: vertexConfig.region ?? 'us-east5',
      });
    } else if (bedrockConfig) {
      client = new AnthropicBedrock({
        awsRegion: bedrockConfig.region ?? 'us-east-1',
      });
    } else if (openrouterConfig) {
      client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: openrouterConfig.apiKey,
      });
    } else {
      client = new Anthropic();
    }
  }
  return client;
}

// Convert Anthropic tool schema to OpenAI function calling format
function anthropicToolToOpenAI(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

/**
 * Call the Anthropic API with a single tool, forcing tool_use.
 * Guarantees structured JSON output matching the tool's input_schema.
 */
export async function callWithTool({ model, prompt, tool, toolChoice, system, verbose, maxTokens }) {
  const apiClient = getClient();

  if (verbose) {
    console.error(`[api] model=${model} tool=${tool.name} prompt_len=${prompt.length}`);
  }

  if (openrouterConfig) {
    // OpenAI-compatible path for OpenRouter
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const response = await apiClient.chat.completions.create({
      model,
      max_tokens: maxTokens ?? 4096,
      temperature: 0,
      tools: [anthropicToolToOpenAI(tool)],
      tool_choice: { type: 'function', function: { name: tool.name } },
      messages,
    });

    const choice = response.choices[0];
    const toolCall = choice.message.tool_calls?.[0];
    if (!toolCall) {
      throw new Error(`Expected tool_call response, got: ${JSON.stringify(choice.message)}`);
    }

    const input = JSON.parse(toolCall.function.arguments);
    const usage = response.usage ?? {};
    totalInput += usage.prompt_tokens ?? 0;
    totalOutput += usage.completion_tokens ?? 0;

    if (verbose) {
      console.error(`[api] usage: input=${usage.prompt_tokens} output=${usage.completion_tokens}`);
    }

    return { name: toolCall.function.name, input };
  }

  // Anthropic path (direct, Vertex, Bedrock)
  const supportsTemperature = !/opus-4-7/.test(model);

  const response = await apiClient.messages.create({
    model,
    max_tokens: maxTokens ?? 4096,
    ...(supportsTemperature ? { temperature: 0 } : {}),
    tools: [tool],
    tool_choice: toolChoice,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUseBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolUseBlock) {
    throw new Error(`Expected tool_use response, got: ${response.content.map(b => b.type).join(', ')}`);
  }

  totalInput += response.usage.input_tokens;
  totalOutput += response.usage.output_tokens;

  if (verbose) {
    console.error(`[api] usage: input=${response.usage.input_tokens} output=${response.usage.output_tokens}`);
  }

  return toolUseBlock;
}

export function getTokenUsage() {
  return { input: totalInput, output: totalOutput };
}

export function resetTokenUsage() {
  totalInput = 0;
  totalOutput = 0;
}
