import { createOpenAI } from "@ai-sdk/openai"
import { Settings, settingsDb, SupportedLlmModel } from "./db"
import { createAnthropic } from "@ai-sdk/anthropic"

export const getSettingByType = async (type: Settings["type"]) => {
  const { docs: [doc] } = await settingsDb.find({ selector: { type } })
  if (doc) {
    return doc.value
  }
  return null
}

export async function getModel() {
  const [apiKey, modelSetting] = await Promise.all([getSettingByType("apiKey"), getSettingByType("model")])
  const model = (() => {
    if (["gpt-4o-mini", "gpt-4o", null].includes(modelSetting))
      return createOpenAI({ apiKey: apiKey || "" })(modelSetting || "gpt-4o-mini")
    if (["claude-3.5-sonnet"].includes(modelSetting || "claude-3.5-sonnet"))
      return createAnthropic({ apiKey: apiKey || "" })(modelSetting || "claude-3.5-sonnet")
    return createOpenAI({ apiKey: apiKey || "" })(modelSetting || "gpt-4o-mini")
  })()
  return model
}
