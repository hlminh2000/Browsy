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

const openai = createOpenAI({
  // apiKey: process.env.OPENAI_API_KEY
  apiKey: "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"
})

async function handleChat(message: string, conversationId: string, tabId?: number) {
  try {
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
