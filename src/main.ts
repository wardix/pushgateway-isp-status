import Fastify, { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import { config } from 'dotenv'

config()

const PORT = process.env.PORT! || 3000
const API_KEYS = process.env.API_KEYS! || '[]'
const PROTECTED_ROUTES = process.env.PROTECTED_ROUTES! || '[]'

const ispStatusMetric: any = {}
const ispStatusLastUpdateMetric: any = {}

const apiKeys = JSON.parse(API_KEYS)
const protectedRoutes = JSON.parse(PROTECTED_ROUTES)

const validateApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  const apiKey = request.headers['x-api-key']
  if (!apiKey || !apiKeys.includes(apiKey)) {
    reply.code(401).send({ error: 'Unauthorized: Invalid API Key' })
  }
}

const ispStatusRoute = async (fastify: FastifyInstance) => {
  fastify.get('/', async (_request, reply) => {
    const output = []
    for (const labels in ispStatusMetric) {
      output.push(`isp_status{${labels}} ${ispStatusMetric[labels]}`)
    }
    for (const labels in ispStatusLastUpdateMetric) {
      output.push(
        `isp_status_lastupdate{${labels}} ${ispStatusLastUpdateMetric[labels]}`
      )
    }
    reply.send(output.join('\n') + '\n')
  })

  fastify.post('/', async (request, reply) => {
    const { node, isp, status } = request.body as {
      node: string
      isp: string
      status: number
    }
    const labels = `node="${node}",isp="${isp}"`
    ispStatusMetric[labels] = status
    ispStatusLastUpdateMetric[labels] = Math.floor(Date.now() / 1000)
    reply.send('OK')
  })

  fastify.patch('/', async (request, reply) => {
    const isps = request.body as {
      node: string
      isp: string
      lastupdate: number
    }[]
    for (const { node, isp, lastupdate } of isps) {
      const labels = `node="${node}",isp="${isp}"`
      if (ispStatusLastUpdateMetric.hasOwnProperty(labels)) {
        continue
      }
      ispStatusLastUpdateMetric[labels] = lastupdate
    }
    reply.send('OK')
  })

  fastify.delete('/', async (request, reply) => {
    const { node, isp } = request.query as { node: string; isp: string }
    const labels = `node="${node}",isp="${isp}"`

    if (ispStatusMetric.hasOwnProperty(labels)) {
      delete ispStatusMetric[labels]
    }
    if (ispStatusLastUpdateMetric.hasOwnProperty(labels)) {
      delete ispStatusLastUpdateMetric[labels]
    }
    reply.send('OK')
  })
}

const fastify = Fastify({ logger: true })

fastify.addHook('preValidation', async (request, reply) => {
  for (const route of protectedRoutes) {
    if (request.routeOptions.url.startsWith(route)) {
      await validateApiKey(request, reply)
      break
    }
  }
})

fastify.register(ispStatusRoute, { prefix: '/isp-status' })

fastify.listen({ port: +PORT, host: '0.0.0.0' }, (err) => {
  if (err) throw err
})
