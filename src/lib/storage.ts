import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const S3_FOLDER = 'Sales QC'

export async function uploadToStorage(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = requiredEnv('S3_BUCKET_NAME')
  const region = requiredEnv('S3_REGION')
  const fullKey = `${S3_FOLDER}/${key}`

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: requiredEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('S3_SECRET_ACCESS_KEY'),
    },
  })

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: fullKey,
    Body: body,
    ContentType: contentType,
  }))

  const encodedKey = fullKey.split('/').map(encodeURIComponent).join('/')
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} environment variable is not set`)
  return value
}
