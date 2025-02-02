import { ChatWebLLM } from "@langchain/community/chat_models/webllm";
import memoize from 'lodash/memoize'

export const loadLocalLlm = memoize(async () => {
  const model = new ChatWebLLM({
    model: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    // model: "Llama-3.2-1B-Instruct-q0f16-MLC",
    chatOptions: {
      temperature: 0,
    },
  });
  await model.initialize((progress) => {
    console.log(`initializing local llm:`, progress);
  });
  return model
})
