import { AiModelSelect } from "@island/web";
import { Stage } from "./_stage";

const noop = () => {};

export const AnthropicProvider = () => (
  <Stage style={{ width: 420 }}>
    <AiModelSelect value="claude-3-5-sonnet-latest" provider="anthropic" onChange={noop} />
  </Stage>
);

export const Disabled = () => (
  <Stage style={{ width: 420 }}>
    <AiModelSelect value="gpt-4o-mini" provider="openai" onChange={noop} disabled />
  </Stage>
);
