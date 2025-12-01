// Run with: node testEmailHarness.mjs
import { sendResetEmail } from '../../functions/utils/emailService.mjs'

// Fake values for testing
const testEmail = 'checkit@mailinator.com'   // use a real inbox you control
const testUsername = 'fakeuser'
const testToken = 'FAKE-TOKEN-123'
const testRturl = 'https://rikitraki.com/'

// Wrap in async IIFE
;(async () => {
  try {
    console.log('Sending test reset email...')
    const result = await sendResetEmail({
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
