// Edge Function: generate-resume-json
// Input: { raw_text: string }
// Output: structured JSON resume matching template fields
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { raw_text } = await req.json()
    if (!raw_text) throw new Error('raw_text required')

    // Basic heuristic fallback while AI integration added later
    const firstLine = raw_text.split(/\n|\r/).find(l => l.trim().length > 0) || ''
    const full_name = firstLine.trim().split(/\s+/).slice(0,3).join(' ')
    const summary = raw_text.slice(0, 600).replace(/\s+/g, ' ').trim()

    const json = {
      personal_information: {
        full_name,
        job_title: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        github: '',
        portfolio: ''
      },
      summary,
      professional_experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      languages: [],
      awards_activities: []
    }

    return new Response(JSON.stringify({ json }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
