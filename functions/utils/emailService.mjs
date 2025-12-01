import mailcomposer from "mailcomposer"
import mailgunJs from "mailgun-js"

const mailgunApiKey = 'process.env.MAILGUN_API_KEY'
const mailgunDomain = "rikitraki.com"
const mailgunFrom = "RikiTraki<noreply@rikitraki.com>"

const mailgun = mailgunJs({ apiKey: mailgunApiKey, domain: mailgunDomain })

export const sendResetEmail = async ({ to, username, token, rturl }) => {
  const mail = mailcomposer({
    from: mailgunFrom,
    to,
    subject: "RikiTraki password reset",
    text: "This message is being sent at your request to reset your RikiTraki password.",
    html: `Follow <a href="${rturl}resetp.html?username=${username}&token=${token}">this</a> link to reset your RikiTraki password<br><br>Thank you`
  })

  const message = await new Promise((resolve, reject) => {
    mail.build((err, msg) => (err ? reject(err) : resolve(msg.toString("ascii"))))
  })

  const mailgunData = {
    to,
    message
  }

  return mailgun.messages().sendMime(mailgunData)
}
