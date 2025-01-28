import '../styles.css'
import React from "react"
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from "react"
import PouchDB from "pouchdb"
import PouchDBFind from 'pouchdb-find'
import PouchDBIDB from 'pouchdb-adapter-indexeddb'

PouchDB.plugin(PouchDBIDB)
PouchDB.plugin(PouchDBFind)

interface Settings {
  _id?: string
  _rev?: string
  type: 'settings'
  apiKey: string
}

const db = new PouchDB<Settings>("settings", {
  adapter: 'indexeddb'
})

function Options() {
  const [apiKey, setApiKey] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const result = await db.find({
        selector: {
          type: 'settings'
        }
      })
      
      if (result.docs.length > 0) {
        setApiKey(result.docs[0].apiKey)
      }
    } catch (error) {
      console.error("Error loading settings:", error)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setSaveStatus('idle')

    try {
      // Try to find existing settings
      const result = await db.find({
        selector: {
          type: 'settings'
        }
      })

      if (result.docs.length > 0) {
        // Update existing settings
        await db.put({
          ...result.docs[0],
          apiKey
        })
      } else {
        // Create new settings
        await db.post({
          type: 'settings',
          apiKey
        })
      }

      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      console.error("Error saving settings:", error)
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white p-8 rounded-lg shadow">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">AI Chat Settings</h1>
          
          <form onSubmit={handleSave}>
            <div className="space-y-4">
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="sk-..."
                />
                <p className="mt-1 text-sm text-gray-500">
                  Your API key will be stored locally and never shared.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSaving || !apiKey.trim()}
                className={`
                  w-full py-2 px-4 rounded-md text-white font-medium
                  ${isSaving || !apiKey.trim()
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600"
                  }
                `}
              >
                {isSaving ? "Saving..." : "Save API Key"}
              </button>

              {saveStatus === 'success' && (
                <p className="text-sm text-green-600 text-center">
                  Settings saved successfully!
                </p>
              )}
              
              {saveStatus === 'error' && (
                <p className="text-sm text-red-600 text-center">
                  Error saving settings. Please try again.
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(<Options />)
} 