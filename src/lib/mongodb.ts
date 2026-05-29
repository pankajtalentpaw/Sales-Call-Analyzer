import { MongoClient } from 'mongodb'

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

let clientPromise: Promise<MongoClient> | undefined

function databaseUrl(): string {
  const uri = process.env.DATABASE_URL
  if (!uri) throw new Error('DATABASE_URL environment variable is not set')
  return uri
}

function connect(uri: string): Promise<MongoClient> {
  return new MongoClient(uri, { serverSelectionTimeoutMS: 10000 }).connect()
}

export function getMongoClient(): Promise<MongoClient> {
  const uri = databaseUrl()

  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = connect(uri).catch((error) => {
        global._mongoClientPromise = undefined
        throw error
      })
    }
    return global._mongoClientPromise
  }

  if (!clientPromise) {
    clientPromise = connect(uri).catch((error) => {
      clientPromise = undefined
      throw error
    })
  }
  return clientPromise
}

export default getMongoClient

export async function getDb() {
  const client = await getMongoClient()
  return client.db()
}
