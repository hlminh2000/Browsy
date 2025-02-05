import { generateText, tool, Message as AiMessage } from "ai"
import { z } from "zod"
import { Message, messagesDb } from "@/common/db"
import { getModel, getSettingByType } from "@/common/settings";
import { getMemoryManager, loadEmbeddingModel } from "@/common/memory";
import { loadLocalLlm } from "@/common/localLlm";

export default defineBackground(() => {

  chrome.runtime.onInstalled.addListener(async (e) => {
    await chrome.runtime.openOptionsPage()
    await Promise.all([
      loadEmbeddingModel(),
      loadLocalLlm(),
    ])
    await Promise.all([
      chrome.sidePanel.setOptions({ path: "sidepanel.html" }),
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    ])
    await chrome.sidePanel.open({
      windowId: (await chrome.windows.getCurrent()).id as number
    })
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


const getActiveTab = async () => {
  const currentWindow = await chrome.windows.getCurrent()
  const [tab] = await chrome.tabs.query({ windowId: currentWindow.id, active: true })
  return tab
}

async function handleChat(message: string, conversationId: string, tabId?: number) {
  try {
    const [apiKey, model] = await Promise.all([ getSettingByType("apiKey"), getModel() ])

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

    // Get conversation history
    const messages = [
      ...(await getConversationMessages(conversationId)).map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user" as const, content: message }
    ]
    const memory = await getMemoryManager();
    const pastMemories = await memory.queryEpisodicMemory({ query: message })

    const result = await generateText({
      model,
      maxSteps: 10,
      system: `
It is ${new Date().toISOString()}. You are in Canada. Your name is Browsy, a friendly browser assistant. 
Your job is to assist the user with perform tasks in the browser, such as booking a flight, or finding a restaurant, etc...
You think through your actions one step at a time, and act accordingly to each step.
Use the tools available for you tonavigate, perform actions and collect relevant information from the webpage.
Go ahead and perform navigations and actions without user input. Only ask for input for critical actions such as submitting payments.
Go ahead and use your judgement to perform actions until the goal is achieved.
When asked a general question, use your tools to navigate and interact with the web to find the answer.

=================
Below are some relevant memories about similar conversations. Consider these for this conversation:
${pastMemories.map(memory => memory.object)}
=================
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
        decideAction: tool({
          description: "Use this tool to decide which action to take next on the webpage.",
          parameters: z.object({
            pageContent: z.string().describe("The content of the page"),
            request: z.string().describe("The request you are trying to fulfill"),
            interactiveElements: z.array(z.object({
              text: z.string().optional(),
              xpath: z.string(),
              tag: z.string(),
            })).describe("Interactive elements identified by the getInteractiveElements tool.")
          }),
          execute: async ({ pageContent, request }) => {
            const { text } = await generateText({
              model,
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
        navigateToPage: tool({
          description: "Use this tool to navigate to a top level",
          parameters: z.object({
            baseUrl: z.string().describe("The base level URL of a webpage (ex: https://google.com, https://amazon.ca, etc...) "),
          }),
          execute: async ({ baseUrl: url }) => {
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
      })) as AiMessage[]
    })

    memory.updateEpisodicMemory({ conversationId, messages })

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
