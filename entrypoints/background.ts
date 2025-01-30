import { createOpenAI } from "@ai-sdk/openai"
import { generateText, tool, Message as AiMessage } from "ai"
import PouchDB from "pouchdb"
import PouchDBFind from 'pouchdb-find'
import PouchDBIDB from 'pouchdb-adapter-indexeddb'
import { z } from "zod"
import { Message, messagesDb, settingsDb } from "@/common/db"

PouchDB.plugin(PouchDBIDB)
PouchDB.plugin(PouchDBFind)

async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const result = await messagesDb.find({
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
    
    // Save user message first
    await saveMessage({
      content: message,
      role: "user" as const,
      conversationId,
    })
    
    if (!apiKey) {
      const errorMessage = {
        content: "Please set your OpenAI API key in the options page.",
        role: "assistant" as const,
        conversationId,
        timestamp: Date.now()
      }
      await saveMessage(errorMessage)
      sendMessageToPopup(errorMessage, tabId)
      return
    }

    const openai = createOpenAI({ apiKey })

    // Get conversation history
    const messages = [
      ...(await getConversationMessages(conversationId)).map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user" as const, content: message }
    ]

    const result = await generateText({
      model: openai("gpt-4-turbo"),
      system: `
It is ${new Date().toISOString()}. You are a browser assistant. Your job is to assist the user with perform tasks in the browser, such as booking a flight, or finding a restaurant, etc...
You think through your actions one step at a time, and act accordingly to each step.
`,
      tools: {
        getCurrentTabContent: tool({
          description: "Get the content of the current tab",
          parameters: z.object({}),
          execute: async () => {
            // const tab = await chrome.tabs.query({ active: true, currentWindow: true })
            // const [{ id: tabId }] = tab
            // if (!tabId) return "No active tab" as string
            return "this is a website about cats" as string
          }
        })
      },
      messages: messages.map(msg => ({
        role: msg.role === 'function' ? 'tool' : msg.role,
        content: msg.content,
      })) as AiMessage[],
      maxSteps: 10,
      onStepFinish: (step) => {
        console.log("step: ", step)
      }
    })
    console.log("result: ", result)

    await saveMessage({
      content: result.text,
      role: "assistant",
      conversationId,
    })

    sendMessageToPopup({
      content: result.text, 
      role: "assistant", 
      conversationId, 
      timestamp: Date.now(),
    }, tabId)
  } catch (error) {
    console.error("Error in chat:", error)
    sendMessageToPopup({ 
      content: "An error occurred while processing your request.", 
      role: "assistant", 
      conversationId, 
      timestamp: Date.now(),
    }, tabId)
  }
}

function sendMessageToPopup(message: Message, tabId?: number) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: "chat_response", ...message })
  } else {
    chrome.runtime.sendMessage({ type: "chat_response", ...message })
  }
}

async function saveMessage(message: Omit<Message, "_id" | "_rev" | "timestamp">) {
  const savedMessage = await messagesDb.post({
    ...message,
    timestamp: Date.now(),
  })
  return savedMessage
}

async function deleteConversation(conversationId: string) {
  const result = await messagesDb.find({
    selector: {
      conversationId: { $eq: conversationId }
    },
    fields: ['_id', '_rev']
  })

  await Promise.all(
    result.docs.map(doc => 
      messagesDb.remove(doc._id!, doc._rev!)
    )
  )

  return { success: true }
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === "chat") {
      await handleChat(request.message, request.conversationId, sender.tab?.id)
      return true
    }

    if (request.type === "delete_conversation") {
      deleteConversation(request.conversationId).then(result => {
        chrome.runtime.sendMessage({ 
          type: "conversation_deleted", 
          conversationId: request.conversationId,
          success: result.success
        })
      })
      return true
    }
  })
});
