// tests/unit/emailService.test.mjs

// Mock mailgun-js before importing emailService
jest.mock('mailgun-js', () => {
  // Define sendMime inside the factory so it's in scope
  const sendMime = jest.fn().mockResolvedValue({ id: 'msgid', message: 'Queued. Thank you.' })
  return jest.fn(() => ({
    messages: () => ({ sendMime })
  }))
})

jest.mock('mailcomposer', () => {
  return jest.fn(() => ({
    build: (cb) => cb(null, Buffer.from('mock message'))
  }))
})

import * as emailService from '../../functions/utils/emailService.mjs'
import mailgunJs from 'mailgun-js'
import * as logger from '../../functions/utils/logger.mjs'
import { messages } from '../../functions/utils/config.mjs'

describe('emailService', () => {
  let client

  beforeEach(() => {
    jest.spyOn(logger, 'error').mockImplementation(() => {})
    client = mailgunJs()
    client.messages().sendMime.mockResolvedValue({ id: 'msgid', message: 'Queued. Thank you.' })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sends reset email successfully', async () => {
    const res = await emailService.sendResetEmail({
      to: 'user@example.com',
      username: 'riki',
      token: 'tok123',
      rturl: 'https://example.com/'
    })
    expect(res).toEqual({ id: 'msgid', message: 'Queued. Thank you.' })
  })

  it('sends registration email successfully', async () => {
    const res = await emailService.sendRegistrationEmail({
      to: 'user@example.com',
      username: 'riki',
      token: 'tok123',
      rturl: 'https://example.com/'
    })
    expect(res).toEqual({ id: 'msgid', message: 'Queued. Thank you.' })
  })

  it('logs and throws when mail build fails', async () => {
    const mailcomposer = require('mailcomposer')
    mailcomposer.mockImplementationOnce(() => ({
      build: (cb) => cb(new Error('build fail'))
    }))

    await expect(emailService.sendResetEmail({
      to: 'user@example.com',
      username: 'riki',
      token: 'tok123',
      rturl: 'https://example.com/'
    })).rejects.toThrow('build fail')

    expect(logger.error).toHaveBeenCalledWith(
      messages.ERROR_MAILGUN_BUILD,
      expect.objectContaining({ err: expect.objectContaining({ message: 'build fail' }) })
    )
  })

  it('logs and throws when sendMime fails', async () => {
    client.messages().sendMime.mockRejectedValueOnce(new Error('send fail'))

    await expect(emailService.sendResetEmail({
      to: 'user@example.com',
      username: 'riki',
      token: 'tok123',
      rturl: 'https://example.com/'
    })).rejects.toThrow('send fail')

    expect(logger.error).toHaveBeenCalledWith(
      messages.ERROR_MAILGUN_SEND,
      expect.objectContaining({ err: expect.objectContaining({ message: 'send fail' }) })
    )
  })
})
