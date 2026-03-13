import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request) {
  const { type, studentEmail, date, time } = await request.json()

  const adminEmail = 'tomasz@tkart.org'

  try {
    if (type === 'booking') {
      // Email to student
      await resend.emails.send({
        from: 'SKF Academy <onboarding@resend.dev>',
        to: studentEmail,
        subject: 'Lesson Booked — SKF Academy',
        html: `
          <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 2rem; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 2rem;">
              <h1 style="color: #cc0000; letter-spacing: 3px; text-transform: uppercase; font-size: 1.5rem;">SKF Academy</h1>
              <p style="color: #666; font-size: 0.8rem; letter-spacing: 2px; text-transform: uppercase;">Shaolin Kung Fu — Est. 1986</p>
            </div>
            <h2 style="color: #fff;">Lesson Confirmed ✓</h2>
            <p style="color: #ccc;">Your private lesson has been booked:</p>
            <div style="background: #2a2a2a; border-left: 3px solid #cc0000; padding: 1rem 1.5rem; margin: 1.5rem 0; border-radius: 4px;">
              <p style="margin: 0; color: #fff; font-size: 1.1rem;"><strong>${date}</strong></p>
              <p style="margin: 0.25rem 0 0; color: #cc0000;">${time}</p>
            </div>
            <p style="color: #666; font-size: 0.9rem;">To cancel or reschedule, log in to your account at least 24 hours before your lesson.</p>
            <hr style="border-color: #333; margin: 2rem 0;" />
            <p style="color: #444; font-size: 0.8rem; text-align: center;">SKF Academy · kungfubc.com</p>
          </div>
        `
      })

      // Email to admin
      await resend.emails.send({
        from: 'SKF Academy <onboarding@resend.dev>',
        to: adminEmail,
        subject: `New Booking — ${studentEmail}`,
        html: `
          <div style="font-family: Georgia, serif; padding: 1.5rem;">
            <h2>New Lesson Booked</h2>
            <p><strong>Student:</strong> ${studentEmail}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
          </div>
        `
      })
    }

    if (type === 'cancellation') {
      // Email to student
      await resend.emails.send({
        from: 'SKF Academy <onboarding@resend.dev>',
        to: studentEmail,
        subject: 'Lesson Cancelled — SKF Academy',
        html: `
          <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 2rem; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 2rem;">
              <h1 style="color: #cc0000; letter-spacing: 3px; text-transform: uppercase; font-size: 1.5rem;">SKF Academy</h1>
            </div>
            <h2 style="color: #fff;">Lesson Cancelled</h2>
            <p style="color: #ccc;">Your lesson on <strong>${date}</strong> at <strong>${time}</strong> has been cancelled.</p>
            <p style="color: #ccc;">Your token has been refunded to your account.</p>
            <p style="color: #666; font-size: 0.9rem;">Book a new lesson anytime at kungfubc.com</p>
            <hr style="border-color: #333; margin: 2rem 0;" />
            <p style="color: #444; font-size: 0.8rem; text-align: center;">SKF Academy · kungfubc.com</p>
          </div>
        `
      })

      // Email to admin
      await resend.emails.send({
        from: 'SKF Academy <onboarding@resend.dev>',
        to: adminEmail,
        subject: `Cancellation — ${studentEmail}`,
        html: `
          <div style="font-family: Georgia, serif; padding: 1.5rem;">
            <h2>Lesson Cancelled</h2>
            <p><strong>Student:</strong> ${studentEmail}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
          </div>
        `
      })
    }

    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
