import type { InitConfig } from '@aries-framework/core'
import type { Express, request } from 'express'

import {
  ConnectionInvitationMessage,
  LogLevel,
  Agent,
  AutoAcceptCredential,
  HttpOutboundTransport,
} from '@aries-framework/core'
import { agentDependencies, HttpInboundTransport } from '@aries-framework/node'
import { startServer } from '@aries-framework/rest'
import axios from 'axios'
import { static as stx } from 'express'
import { connect } from 'ngrok'
import { createExpressServer, useContainer } from 'routing-controllers'
import { Container } from 'typedi'

import { CredDefService } from './controllers/CredDefService'
import { TestLogger } from './logger'
import { AgentCleanup } from './utils/AgentCleanup'
import { CANDY_DEV, SOVRIN_MAINNET, SOVRIN_STAGINGNET } from './utils/utils'

const logger = new TestLogger(process.env.NODE_ENV ? LogLevel.error : LogLevel.trace)

process.on('unhandledRejection', (error) => {
  if (error instanceof Error) {
    logger.fatal(`Unhandled promise rejection: ${error.message}`, { error })
  } else {
    logger.fatal('Unhandled promise rejection due to non-error error', {
      error,
    })
  }
})

const run = async () => {
  const endpoint = process.env.AGENT_ENDPOINT ?? (await connect(5001))
  const agentConfig: InitConfig = {
    label: 'BC Wallet',
    walletConfig: {
      id: 'BC Wallet',
      key: process.env.AGENT_WALLET_KEY ?? 'BC Wallet',
    },
    indyLedgers: [
      {
        id: 'CandyDev',
        genesisTransactions: CANDY_DEV,
        isProduction: false,
      },
      {
        id: 'MainNet',
        genesisTransactions: SOVRIN_MAINNET,
        isProduction: false,
      },
      {
        id: 'StagingNet',
        genesisTransactions: SOVRIN_STAGINGNET,
        isProduction: false,
      },
    ],
    logger: logger,
    publicDidSeed: process.env.AGENT_PUBLIC_DID_SEED,
    endpoints: [endpoint],
    autoAcceptConnections: true,
    autoAcceptCredentials: AutoAcceptCredential.ContentApproved,
    useLegacyDidSovPrefix: true,
    connectionImageUrl: 'https://i.imgur.com/g3abcCO.png',
  }

  const agent = new Agent(agentConfig, agentDependencies)

  const httpInbound = new HttpInboundTransport({
    port: 5001,
  })

  agent.registerInboundTransport(httpInbound)

  agent.registerOutboundTransport(new HttpOutboundTransport())

  await agent.initialize()

  const app: Express = createExpressServer({
    controllers: [__dirname + '/controllers/**/*.ts', __dirname + '/controllers/**/*.js'],
    cors: true,
    routePrefix: '/demo',
  })

  httpInbound.app.get('/', async (req, res) => {
    if (typeof req.query.c_i === 'string') {
      try {
        const invitation = await ConnectionInvitationMessage.fromUrl(req.url.replace('d_m=', 'c_i='))
        res.send(invitation.toJSON())
      } catch (error) {
        res.status(500)
        res.send({ detail: 'Unknown error occurred' })
      }
    }
  })

  httpInbound.app.get('/url/:proofId', async (req, res) => {
    const apiCall = axios.create({ baseURL: 'http://localhost:5000' })
    const proofData = await apiCall.get(`/proofs/${req.params.proofId}`)
    const proofRequest = proofData.data.requestMessage
    if (req.headers.accept === 'application/json') {
      res.json(proofRequest)
    } else {
      res.redirect(`/?d_m=${encodeURIComponent(Buffer.from(JSON.stringify(proofRequest)).toString('base64'))}`)
    }
  })

  app.use('/public', stx(__dirname + '/public'))

  const credDefService = new CredDefService(agent)
  useContainer(Container)
  Container.set(CredDefService, credDefService)

  const job = AgentCleanup(agent)
  job.start()

  app.get('/server/last-reset', async (req, res) => {
    res.send(job.lastDate())
  })

  // Redirect QR code scans for installing bc wallet to the apple or google play store 
  const androidUrl = 'https://play.google.com/store/apps/details?id=ca.bc.gov.BCWallet'
  const appleUrl= 'https://apps.apple.com/us/app/bc-wallet/id1587380443'
  app.get('/qr', async (req, res) => {
    const appleMatchers = [
      /iPhone/i,
      /iPad/i,
      /iPod/i
    ]
    let url = androidUrl
    const isApple = appleMatchers.some((item)=>req.get('User-Agent')?.match(item))
    if(isApple){
      url = appleUrl
    }
    res.redirect(url)
    return res
  })

  await startServer(agent, {
    port: 5000,
    app: app,
  })
}

run()
