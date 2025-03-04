import '../styles.css'
import React from "react"
import { createRoot } from 'react-dom/client'
import { useRef } from "react"
import ReactMarkdown from 'react-markdown'
import { useMessaging } from '@/common/hooks/useMessaging'
import { settingsDb, SupportedLlmModel } from '@/common/db'

function Popup() {
  const {
    messages,
    input,
    setInput,
    isLoading,
    currentConversationId,
    conversations,
    handleSubmit,
    deleteConversation: deleteConversationBase,
    selectConversation: selectConversationBase,
    startNewConversation
  } = useMessaging()

  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const hamburgerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Handles click-outside behavior for the drawer component
    function handleClickOutside(event: MouseEvent) {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(event.target as Node) &&
        !hamburgerRef.current?.contains(event.target as Node)
      ) {
        setIsDrawerOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectConversation = (conversationId: string) => {
    selectConversationBase(conversationId)
    setIsDrawerOpen(false)
  }

  const deleteConversation = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteConversationBase(conversationId)
  }

  const [selectedLlmModel, setSelectedLlmModel] = useState<SupportedLlmModel | null>(null);
  useEffect(() => {
    const loadModel = async () => {
      const { docs: [doc] } = await settingsDb.find({ selector: { type: 'model' } })
      if (doc) {
        setSelectedLlmModel(doc.value as SupportedLlmModel)
      } else {
        await settingsDb.post({ value: "gpt-4o-mini", type: "model" })
        setSelectedLlmModel("gpt-4o-mini")
      }
    }
    loadModel()
  }, [])
  const onModelChange: React.ChangeEventHandler<HTMLSelectElement> = async (e) => {
    const model = e.target.value as SupportedLlmModel
    const { docs: [doc] } = await settingsDb.find({ selector: { type: 'model' } })
    if (doc) {
      settingsDb.put({ ...doc, llmModel: model })
    } else {
      settingsDb.post({ type: "model", value: model })
    }
    setSelectedLlmModel(model)
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 relative">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              ref={hamburgerRef}
              onClick={(e) => {
                e.stopPropagation()
                setIsDrawerOpen(!isDrawerOpen)
              }}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={startNewConversation}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
              </svg>
            </button>
            <select
              className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={selectedLlmModel || "gpt-4o-mini" as SupportedLlmModel}
              onChange={onModelChange}
            >
              {/* <option value="claude-3.5-sonnet">Claude 3 Sonnet</option> */}
              <option value="gpt-4o">GPT 4o</option>
              <option value="gpt-4o-mini">GPT 4o Mini</option>
            </select>
          </div>
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="flex items-center gap-1.5 p-2 text-sm text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
            title="Open Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`
          absolute top-[57px] left-0 w-64 h-[calc(100%-57px)] 
          bg-white border-r border-gray-200 shadow-lg z-10 
          transform transition-transform duration-200 ease-in-out
          ${isDrawerOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="h-full overflow-y-auto p-4 space-y-2">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`group relative rounded-lg transition-colors ${conv.id === currentConversationId
                ? "bg-blue-50"
                : "hover:bg-gray-50"
                }`}
            >
              <button
                onClick={() => selectConversation(conv.id)}
                className="w-full p-3 text-left"
              >
                <p className={`text-sm font-medium truncate ${conv.id === currentConversationId
                  ? "text-blue-600"
                  : "text-gray-700"
                  }`}>{conv.preview}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(conv.lastMessageAt).toLocaleDateString()}
                </p>
              </button>
              <button
                onClick={(e) => deleteConversation(conv.id, e)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full 
                  text-gray-400 hover:text-red-500 hover:bg-red-50 
                  opacity-0 group-hover:opacity-100 transition-all"
                title="Delete conversation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Backdrop */}
      {isDrawerOpen && (
        <div
          className="absolute inset-0 bg-black bg-opacity-25 z-0 
            transition-opacity duration-200 ease-in-out"
          style={{ marginTop: '57px' }}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((message, i) => (
          <div
            key={`${message.conversationId}_${i}`}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} w-full`}
          >
            <div
              className={`
                max-w-[80%] px-4 py-2 rounded-2xl
                ${message.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-white border border-gray-200"
                }
                shadow-sm prose prose-sm max-w-none
                ${message.role === "user" ? "prose-invert" : ""}
              `}
            >
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start w-full">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2 shadow-sm">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex space-x-2 m-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={`
              p-2 rounded-full transition-colors
              ${isLoading || !input.trim()
                ? "bg-gray-100 text-gray-400"
                : "bg-blue-500 text-white hover:bg-blue-600"
              }
            `}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(<Popup />)
}