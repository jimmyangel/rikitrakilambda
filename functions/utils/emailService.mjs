import mailcomposer from 'mailcomposer'
import mailgunJs from 'mailgun-js'
import * as logger from './logger.mjs'
import { messages } from './config.mjs'

const mailgunApiKey = process.env.MAILGUN_API_KEY || 'test-api-key'
const mailgunDomain = 'rikitraki.com'
const mailgunFrom = 'RikiTraki<noreply@rikitraki.com>'

const mailgun = mailgunJs({ apiKey: mailgunApiKey, domain: mailgunDomain })

// Generic helper
const sendEmail = async ({ to, subject, text, html }) => {

  if (!to || !subject || !text || !html) {
    throw new Error('Missing required email parameters')
  }

  const mail = mailcomposer({ from: mailgunFrom, to, subject, text, html })

  let message
  try {
    message = await new Promise((resolve, reject) => {
      mail.build((err, msg) => (err ? reject(err) : resolve(msg.toString("ascii"))))
    })
  } catch (err) {
    logger.error(messages.ERROR_MAILGUN_BUILD, { err: { message: err.message } })
    throw err
  }

  try {
    return await mailgun.messages().sendMime({ to, message })
  } catch (err) {
    logger.error(messages.ERROR_MAILGUN_SEND, { err: { message: err.message } })
    throw err
  }
}

// Specific wrappers
export const sendResetEmail = ({ to, username, token, rturl }) => {
  return sendEmail({
    to,
    subject: 'RikiTraki password reset',
    text: 'This message is being sent at your request to reset your RikiTraki password.',
    html: `Follow <a href="${rturl}resetp.html?username=${username}&token=${token}">this</a> link to reset your RikiTraki password<br><br>Thank you`
  })
}

export const sendRegistrationEmail = ({ to, username, token, rturl }) => {
  return sendEmail({
    to,
    subject: 'RikiTraki account activation',
    text: 'This message is being sent at your request to register in RikiTraki.',
    html: `Follow <a href="${rturl}activate.html?username=${username}&token=${token}">this</a> link to activate your RikiTraki account<br><br>Thank you`
  })
}

