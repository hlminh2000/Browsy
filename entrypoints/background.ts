// import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import PouchDB from "pouchdb-browser"
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
  // baseURL: "https://api.deepseek.com",
  apiKey: "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",
  // custom settings, e.g.
  compatibility: 'strict', // strict mode, enable when using the OpenAI API
});

interface Conversation {
  _id?: string
  _rev?: string
  timestamp: string
  user: string
  ai: string
}

const db = new PouchDB<Conversation>("conversations")


async function handleChat(message: string, tabId?: number) {
  console.log("handleChat", message)
  try {
    // const apiKey = await getApiKey()
    // if (!apiKey) {
    //   sendMessageToPopup({ error: "API key not set. Please set it in the options page." }, tabId)
    //   return
    // }

    const result = await generateText({
      model: openai("gpt-4-turbo"),
      messages: [{ role: "user", content: message }],
    })
    console.log("result", result)

    const response = await result.text

    // Save conversation to PouchDB
    await db.post({
      timestamp: new Date().toISOString(),
      user: message,
      ai: response,
    })

    sendMessageToPopup({ response }, tabId)
  } catch (error) {
    console.error("Error in chat:", error)
    sendMessageToPopup({ error: "An error occurred while processing your request." }, tabId)
  }
}

function sendMessageToPopup(message: { response?: string; error?: string }, tabId?: number) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: "chat_response", ...message })
  } else {
    chrome.runtime.sendMessage({ type: "chat_response", ...message })
  }
}

async function getApiKey(): Promise<string | undefined> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["openaiApiKey"], (result) => {
      resolve(result.openaiApiKey)
    })
  })
}


export default defineBackground(() => {
  console.log('Hello background!', { id: chrome.runtime.id });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "chat") {
      handleChat(request.message, sender.tab?.id)
      return true // Indicates we will send a response asynchronously
    }
  })
});
