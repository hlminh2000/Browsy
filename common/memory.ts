import { QueryOptions, VectorDB } from "idb-vector";
import { generateObject } from "ai";
import { getModel } from "./settings";
import memoize from "lodash/memoize";
import { z } from "zod";
import "@tensorflow/tfjs-backend-webgl";
import { loadLocalLlm } from "./localLlm";
import { HumanMessage } from "@langchain/core/messages";

export const loadEmbeddingModel = memoize(async () => {
  const { load } = await import('@tensorflow-models/universal-sentence-encoder');
  const tf = await import('@tensorflow/tfjs-core');
  // Required for Chrome Extension environment
  await tf.setBackend('webgl');
  return load();
})

async function embeddingFromText(text: string) {
  const model = await loadEmbeddingModel()
  const [vector] = await (await model.embed(text)).array();
  return vector;
}

const createVectorDb = <Metadata = {}>({ dbName }: { dbName: string }) => {
  const db = new VectorDB({
    dbName: dbName,
    objectStore: dbName,
    vectorPath: 'vector'
  })

  type Doc = {
    vector: number[],
    content: string,
    metadata?: Metadata,
  }

  return {
    query: async (queryStr: string, options?: QueryOptions) =>
      db.query(await embeddingFromText(queryStr), options),
    insert: async (content: string, metadata?: Metadata) =>
      db.insert({ vector: await embeddingFromText(content), content, metadata } as Doc),
    delete: (...args: Parameters<typeof db.delete>) => db.delete(...args),
    update: db.update,
  }
}

export const getMemoryManager = memoize(async () => {
  type EpisodicMemory = { context: string, good: string, toBeImproved: string, conversationId: string };
  const episodicMemoryStore = createVectorDb<EpisodicMemory>({ dbName: "episodicMemory" })
  const model = await getModel()

  const generateEpisodicMemory = async (args: { messages: { role: string, content: string }[], conversationId: string }) => {
    const { messages, conversationId } = args;
    const { object } = await generateObject({
      model,
      system: `
You are an assistant agent, tasked with summarizing your interaction with the user. The user will provide
you with a transcript of the conversation, provide your summary and reflection on this interaction accordingly
      `,
      schema: z.object({
        "context": z.string().describe("A summary of the context of the conversation"),
        "good": z.string().describe("What went well"),
        "toBeImproved": z.string().describe("What could be better"),
      }),
      messages: [
        {
          role: "user",
          content: `
It is ${new Date().toISOString()}, Generate a memory object based on the following conversation transcript:
============= conversaiton transcript =============
${messages.map(({ role, content }) => `${role}: ${content}`).join("\n")}
===================================================
          `
        }
      ]
    })
    return { ...object, conversationId }
  }
  const generateConversationSummary = async (args: { messages: { role: string, content: string }[] }) => {
    const { messages } = args;
    const { object } = await generateObject({
      model,
      system: `
You are an assistant agent, tasked with summarizing your interaction with the user. 
Based on the conversation transcript between you and the user, generate a summary of the conversaiotn.
      `,
      schema: z.object({
        "summary": z.string().describe("A summary of the context of the conversation"),
      }),
      messages: [
        {
          role: "user",
          content: `
It is ${new Date().toISOString()}, generate a summary based on the following conversation transcript:
============= conversaiton transcript =============
${messages.map(({ role, content }) => `${role}: ${content}`).join("\n")}
===================================================
          `
        }
      ]
    })
    return object.summary
  }

  const updateEpisodicMemory = async (args: { conversationId: string, messages: { role: string, content: string }[] }) => {
    const { conversationId } = args
    const [memory, localLlm] = await Promise.all([generateEpisodicMemory(args), loadLocalLlm()])
    const matchingMemories = (await episodicMemoryStore.query(memory.context))
      .filter(result => result.similarity >= 0.7)
    const combined = [
      ...matchingMemories.map(result => result.object as EpisodicMemory), 
      memory
    ]
    const [summarizedContext, summarizedGoodPoints, summarizedImprovementPoints] = await Promise.all([
      localLlm.invoke([new HumanMessage({
        content: `
          Summarize the following points into one sentence that captures all points:
          ${combined.map(mem => `- ${mem.context}`).join("\n")}
        `
      })]).then(result => result.content as string),
      localLlm.invoke([new HumanMessage({
        content: `
          Summarize the following points into one sentence that captures all points:
          ${combined.map(mem => `- ${mem.good}`).join("\n")}
        `
      })]).then(result => result.content as string),
      localLlm.invoke([new HumanMessage({
        content: `
          Summarize the following points into one sentence that captures all points:
          ${combined.map(mem => `- ${mem.toBeImproved}`).join("\n")}
        `
      })]).then(result => result.content as string)
    ])
    const combinedMemory: EpisodicMemory = {
      conversationId,
      context: summarizedContext,
      good: summarizedGoodPoints,
      toBeImproved: summarizedImprovementPoints
    }
    for (const mem of matchingMemories) {
      episodicMemoryStore.delete(mem.key)
    }
    await episodicMemoryStore.insert(combinedMemory.context, combinedMemory)
  }

  const queryEpisodicMemory = async (args: { query: string }) => {
    const { query } = args;
    const result = await episodicMemoryStore.query(query, { limit: 10 })
    return result
      .map((result) => ({ ...result, object: result.object as EpisodicMemory }))
  }

  return {
    generateConversationSummary,
    generateEpisodicMemory,
    updateEpisodicMemory,
    queryEpisodicMemory
  }
})
