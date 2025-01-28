import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import PouchDB from "pouchdb"
import PouchDBFind from 'pouchdb-find'
import PouchDBIDB from 'pouchdb-adapter-indexeddb'

PouchDB.plugin(PouchDBIDB)
PouchDB.plugin(PouchDBFind)

interface Message {
  _id?: string
  _rev?: string
  conversationId: string
  timestamp: string
  role: "user" | "assistant"
  content: string
}

const db = new PouchDB<Message>("messages", {
  adapter: 'indexeddb'
})

interface Settings {
  _id?: string
  _rev?: string
  type: 'settings'
  apiKey: string
}

const settingsDb = new PouchDB<Settings>("settings", {
  adapter: 'indexeddb'
})

// Create index for conversationId
db.createIndex({
  index: {
    fields: ['conversationId', 'timestamp'],
    ddoc: 'conversation-index'
  }
}).catch(err => console.error('Error creating index:', err))

async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const result = await db.find({
    selector: {
      conversationId: { $eq: conversationId }
    },
    fields: ['_id', '_rev', 'conversationId', 'timestamp', 'role', 'content'],
    sort: [{ conversationId: 'asc' }, { timestamp: 'asc' }]
  })
  
  return result.docs
}

async function getApiKey(): Promise<string | null> {
  try {
    const result = await settingsDb.find({
      selector: {
        type: 'settings'
      }
    })
    
    if (result.docs.length > 0) {
      return result.docs[0].apiKey
    }
    return null
  } catch (error) {
    console.error("Error getting API key:", error)
    return null
  }
}

async function handleChat(message: string, conversationId: string, tabId?: number) {
  try {
    const apiKey = await getApiKey()
    if (!apiKey) {
      sendMessageToPopup({ error: "Please set your OpenAI API key in the options page." }, tabId)
      return
    }

    const openai = createOpenAI({ apiKey })

    // Get conversation history
    const conversationMessages = await getConversationMessages(conversationId)
    const messages = conversationMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
    
    // Add current message
    messages.push({ role: "user", content: message })

    const result = await generateText({
      model: openai("gpt-4-turbo"),
      messages
    })

    sendMessageToPopup({ response: result.text }, tabId)
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

export default defineBackground(() => {
  console.log('Hello background!', { id: chrome.runtime.id });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);
    if (request.type === "chat") {
      handleChat(request.message, request.conversationId, sender.tab?.id)
      return true
    }
  })
});
