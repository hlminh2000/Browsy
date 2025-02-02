import { QueryOptions, VectorDB } from "idb-vector";
import { generateObject } from "ai";
import { getModel } from "./settings";
import memoize from "lodash/memoize";
import { z } from "zod";
import "@tensorflow/tfjs-backend-webgl";
// import { TensorFlowEmbeddings } from "@langchain/community/embeddings/tensorflow";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

const loadEmbeddingModel = memoize(async () => {
  const { load } = await import('@tensorflow-models/universal-sentence-encoder');
  const tf = await import('@tensorflow/tfjs-core');
  // Required for Chrome Extension environment
  await tf.setBackend('webgl');
  return load();
})

async function embeddingFromText(text: string) {
  // const embeddings = new HuggingFaceTransformersEmbeddings();
  // await import("@tensorflow/tfjs-backend-webgl")
  // const { TensorFlowEmbeddings } = await import("@langchain/community/embeddings/tensorflow")

  // const embeddings = new TensorFlowEmbeddings();
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
    query: async (queryStr: string, options: QueryOptions) =>
      db.query(await embeddingFromText(queryStr), options),
    insert: async (content: string, metadata?: Metadata) =>
      db.insert({ vector: await embeddingFromText(content), content, metadata } as Doc),
    delete: db.delete,
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

  const addEpisodicMemory = async (args: { conversationId: string, messages: {role: string, content: string}[] }) => {
    const { conversationId } = args
    const memory = await generateEpisodicMemory(args)
    await episodicMemoryStore.insert(memory.context, memory)
  }

  const queryEpisodicMemory = async (args: { conversationSummary: string }) => {
    const { conversationSummary } = args;
    const result = await episodicMemoryStore.query(conversationSummary, { limit: 3 })
    return result.map((result) => ({ ...result, object: result.object as EpisodicMemory }))
  }

  const updateEpisodicMemory = async (args: { 
    conversationId: string, 
    conversationSummary: string, 
    memory: EpisodicMemory 
  }) => {
    const { conversationId, memory, conversationSummary } = args;
    const [result] = await queryEpisodicMemory({ conversationSummary })
    if (result?.object?.conversationId === conversationId) {
      await episodicMemoryStore.update(result?.key, { ...memory, conversationId })
    }
  }

  return {
    generateConversationSummary,
    generateEpisodicMemory,
    addEpisodicMemory,
    queryEpisodicMemory,
    updateEpisodicMemory
  }
})

// export const episodicMemory = createVectorDb<{ conversationId: string }>({dbName: "episodicMemory" })
// export const semanticVectorIndex = createVectorDb<{ conversationId: string }>({dbName: "episodicMemory" })
