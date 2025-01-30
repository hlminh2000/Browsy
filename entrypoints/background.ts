import { createOpenAI } from "@ai-sdk/openai"
import { generateText, tool, Message as AiMessage, generateObject } from "ai"
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

const getActiveTab = async () => {
  const currentWindow = await chrome.windows.getCurrent()
  const [tab] = await chrome.tabs.query({ windowId: currentWindow.id, active: true })
  return tab
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
      model: openai("gpt-4o-mini"),
      system: `
It is ${new Date().toISOString()}. You are in Canada. You are a friendly browser assistant. Your job is to assist the user with perform tasks in the browser, such as booking a flight, or finding a restaurant, etc...
You think through your actions one step at a time, and act accordingly to each step.
Use the tools available for you tonavigate, perform actions and collect relevant information from the webpage.
`,
      tools: {
        getCurrentTabContent: tool({
          description: "Use this to get the current content of the page, useful for answer user questions, or observing the page before and after performAction tool.",
          parameters: z.object({}),
          execute: async () => {
            const currentWindow = await chrome.windows.getCurrent()
            const tabs = await chrome.tabs.query({ windowId: currentWindow.id, active: true })
            if (!tabs.length) return "No active tab"
            const [{ id: tabId }] = tabs
            if (!tabId) return "Invalid tab ID"

            try {
              const pageContent = await chrome.tabs.sendMessage(tabId, { type: "get_page_content" })
              return pageContent
            } catch (error) {
              console.error("Error getting page content:", error)
              return "Error: Could not retrieve page content"
            }
          }
        }),
        planStrategy: tool({
          description: "Use this tool to get a plan of how you will perform a task",
          parameters: z.object({
            task: z.string().describe("The task you are trying to perform"),
          }),
          execute: async ({ task }) => {
            const { object: { plan } } = await generateObject({
              model: openai("gpt-4o-mini"),
              schema: z.object({
                plan: z.array(z.string()).describe("The sequential steps to take").max(10)
              }),
              system: `
You are a component of a browser assia
`
            })
            return plan
          }
        }),
        decideAction: tool({
          description: "Use this tool to decide which action to take next",
          parameters: z.object({
            pageContent: z.string().describe("The content of the page"),
            request: z.string().describe("The request you are trying to fulfill"),
            interactiveElements: z.array(z.object({
              text: z.string().optional(),
              xpath: z.string(),
              tag: z.string(),
              attributes: z.record(z.string()),
            })).describe("Interactive elements identified by the getInteractiveElements tool.")
          }),
          execute: async ({ pageContent, request }) => {
            const { text } = await generateText({
              model: openai("gpt-4o-mini"),
              system: `
You are an expert model specialized in deciding which action to take next on a webpage, based on a user's request.
Do not perform the task, only provide the appropriate step to take. 
Examples: "Submit the form", "Fill the name field", etc...
If no action is needed, say "No action needed".
============================ Webpage content ============================
${pageContent}
=========================================================================
`,
              messages: [{ role: "user", content: request } ]
            })
            return text
          }
        }),
        getInteractiveElements: tool({
          description: "Use this to get a list of interactive elements in the page",
          parameters: z.object({}),
          execute: async () => {
            const activeTab = await getActiveTab();
            if (!activeTab) return "No active tab"
            try {
              const elements = await chrome.tabs.sendMessage(activeTab.id as number, { type: "get_interactive_elements" })
              return elements
            } catch (error) {
              console.error("Error getting page content:", error)
              return "Error: Could not retrieve page content"
            }
          }
        }),
        performAction: tool({
          description: "Use this tool to perform an action on the active page, as suggested by decideAction",
          parameters: z.object({
            elementXpah: z.string().describe("The xpath of the element to interact with, based on result of getInteractiveElements tool"),
            action: z.enum(["click", "type", "submit"]),
            value: z.string().optional(),
          }),
          execute: async ({ elementXpah, action, value }) => {
            const activeTab = await getActiveTab();
            if (!activeTab) return "No active tab"
            // chrome.debugger.sendCommand({tabId: activeTab.id}, "")
            try {
              await chrome.tabs.sendMessage(activeTab.id as number, {
                type: "perform_action",
                elementXpah,
                action,
                value,
              })
              await new Promise(resolve => setTimeout(resolve, 2000))
              return await await chrome.tabs.sendMessage(activeTab.id as number, { type: "get_interactive_elements" })
            } catch (error) {
              console.error("Error performing action:", error)
              return "Error: Could not perform action"
            }
          }
        }),
        navigateToUrl: tool({
          description: "Use this tool to navigate to a URL",
          parameters: z.object({
            url: z.string().describe("The URL to navigate to"),
          }),
          execute: async ({ url }) => {
            const activeTab = await getActiveTab();
            if (!activeTab) return "No active tab"
            try {
              return new Promise(async (resolve) => {
                const onUpdate = async function (tabId: number, info: {status?: string}) {
                  if (info.status === 'complete' && tabId === activeTab.id) {
                    resolve( await chrome.tabs.sendMessage(activeTab.id as number, { type: "get_interactive_elements" }) )
                    chrome.tabs.onUpdated.removeListener(onUpdate);
                  }
                }
                chrome.tabs.onUpdated.addListener(onUpdate);
                await chrome.tabs.update(activeTab.id as number, { url })
              })
            } catch (error) {
              console.error("Error navigating to URL:", error)
              return "Error: Could not navigate to URL"
            }
          }
        }),
      },
      messages: messages.map(msg => ({
        role: msg.role === 'function' ? 'tool' : msg.role,
        content: msg.content,
      })) as AiMessage[],
      maxSteps: 20,
      onStepFinish: (step) => {
      }
    })

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
  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setOptions({ path: "sidepanel.html" });
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });

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
