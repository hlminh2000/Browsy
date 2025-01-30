import PouchDB from "pouchdb"
import PouchDBFind from 'pouchdb-find'
import PouchDBIDB from 'pouchdb-adapter-indexeddb'

PouchDB.plugin(PouchDBIDB)
PouchDB.plugin(PouchDBFind)

export interface Message {
  _id?: string
  _rev?: string
  conversationId: string
  timestamp: number
  role: "user" | "assistant" | "system" | "function"
  content: string
  id?: string
  name?: string
  function_call?: {
    name: string
    arguments: string
  }
}


// Initialize PouchDB and create indexes
export const messagesDb = new PouchDB<Message>("messages", { adapter: 'indexeddb' })

// Create index for conversationId and timestamp
messagesDb.createIndex({
  index: {
    fields: ['conversationId', 'timestamp'],
    ddoc: 'conversation-index'
  }
}).catch(err => console.error('Error creating index:', err))

messagesDb.createIndex({
  index: {
    fields: ['timestamp'],
    ddoc: 'timestamp-index'
  }
}).catch(err => console.error('Error creating index:', err))

messagesDb.createIndex({
  index: {
    fields: ['timestamp', 'conversationId'],
    ddoc: 'timestamp-index'
  }
}).catch(err => console.error('Error creating index:', err))

export interface Settings {
  _id?: string
  _rev?: string
  type: 'settings'
  apiKey: string
}

export const settingsDb = new PouchDB<Settings>("settings", {
  adapter: 'indexeddb'
})