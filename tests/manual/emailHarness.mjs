// Run with: node testEmailHarness.mjs <API_KEY> <reset|registration>

const [, , apiKeyArg, emailTypeArg] = process.argv

if (!apiKeyArg || !emailTypeArg) {
  console.error('Usage: node testEmailHarness.mjs <API_KEY> <reset|registration>')
  process.exit(1)
}

// Set env before loading emailService
process.env.MAILGUN_API_KEY = apiKeyArg
// Optionally set domain if not hardcoded in emailService
process.env.MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'sandbox12345.mailgun.org'

// Dynamically import after env is set
const { sendResetEmail, sendRegistrationEmail } = await import('../../functions/utils/emailService.mjs')

// Fake values for testing
const testEmail = 'checkit@mailinator.com'   // use a real inbox you control
const testUsername = 'fakeuser'
const testToken = 'FAKE-TOKEN-123'
const testRturl = 'https://rikitraki.com/'

// Pick which function to call
const sendFn =
  emailTypeArg === 'reset'
    ? sendResetEmail
    : emailTypeArg === 'registration'
    ? sendRegistrationEmail
    : null

if (!sendFn) {
  console.error('Email type must be "reset" or "registration"')
  process.exit(1)
}

// Wrap in async IIFE
;(async () => {
  try {
    console.log(`Sending test ${emailTypeArg} email...`)
    const result = await sendFn({
      to: testEmail,
      username: testUsername,
      token: testToken,
      rturl: testRturl
    })
    console.log('Mailgun response:', result)
  } catch (err) {
    console.error('Error sending test email:', err)
  }
})()

