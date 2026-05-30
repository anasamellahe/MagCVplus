# MagCV+ | AI-Powered Resume Intelligence Platform                      
                                                                        
## Overview                                                             
MagCV+ is a high-performance resume management and enhancement engine.  
It transforms static, unstructured PDF documents into dynamic,          
structured datasets. By leveraging Large Language Models (LLMs) and a   
serverless event-driven architecture, MagCV+ allows users to extract,   
edit, and optimize professional profiles with surgical precision.       
                                                                        
The platform is designed to bridge the gap between legacy document      
formats and modern, data-driven recruitment pipelines.                  
                                                                        
## System Architecture                                                  
                                                                        
The project employs a modern "Thin Client, Thick Edge" architecture,    
offloading heavy computational tasks to distributed serverless functions
while maintaining a highly responsive user interface.                   
                                                                        
### 1. Intelligence Layer (AI Extraction)                               
The core of MagCV+ is its extraction engine, hosted within **Supabase   
Edge Functions**.                                                       
- **Contextual Parsing**: Unlike standard OCR, the system uses LLM-based
parsing to understand the semantic structure of a resume. It identifies 
the difference between a "Project Description" and "Work Experience"    
based on context, not just formatting.                                  
- **JSON Schema Enforcement**: The AI pipeline enforces a strict JSON   
schema during extraction, ensuring that data is normalized for the      
database and consistent across different resume layouts.                
                                                                        
### 2. Infrastructure & Persistence                                     
- **Auth & Security**: Handled via Supabase Auth, providing JWT-based   
session management and Row Level Security (RLS) on all database tables. 
- **Real-time Database**: A PostgreSQL instance manages the structured  
resume data, allowing for instant updates during the editing phase.     
- **Object Storage**: Original PDF uploads are versioned and stored in  
Supabase Storage buckets, linked directly to the user's profile.        
                                                                        
### 3. Frontend Architecture                                            
- **Framework**: React 18+ powered by Vite for near-instantaneous hot   
module replacement (HMR).                                               
- **Component Strategy**: Built on **shadcn/ui** and **Radix UI**       
primitives, ensuring the interface is accessible, performant, and       
consistent.                                                             
- **Styling**: Utility-first CSS via Tailwind, enabling a responsive    
design that adapts to complex data-heavy views.                         
                                                                        
## Technical Stack                                                      
                                                                        
- **Language**: TypeScript (End-to-end type safety)                     
- **Frontend**: React, Vite, Lucide Icons                               
- **UI/UX**: Tailwind CSS, shadcn/ui                                    
- **Backend**: Supabase (PostgreSQL, Edge Functions, Auth, Storage)     
- **Deployment**: Netlify                                               
                                                                         
## Getting Started                                                       
                                                                         
### Prerequisites                                                        
- Node.js (v18 or higher)                                                
- Supabase CLI                                                           
- A Supabase Project with AI provider integration (e.g., OpenAI or Groq  
for Edge Functions)                                                      
                                                                         
### Local Development Setup                                              
                                                                         
1. **Clone the repository**:                                             
   ```bash                                                               
   git clone https://github.com/anasamellahe/MagCVplus.git               
   cd MagCVplus                                                          
   ```                                                                   
                                                                         
2. **Install dependencies**:                                             
   ```bash                                                               
   npm install                                                           
   ```                                                                   
                                                                         
3. **Configure Environment**:                                            
   Create a `.env` file in the root directory with your Supabase         
credentials:                                                             
    ```env                                                               
    VITE_SUPABASE_URL=your_project_url                                   
    VITE_SUPABASE_ANON_KEY=your_anon_key                                 
    ```                                                                  
                                                                         
4. **Initialize Supabase**:                                              
   ```bash                                                               
   supabase link --project-ref your_project_id                           
   supabase functions serve                                              
   ```                                                                   
                                                                         
5. **Start the development server**:                                     
    ```bash                                                              
    npm run dev                                                          
    ```                                                                  
                                                                         
## Workflow: From PDF to Structured Profile                              
                                                                         
1. **Ingestion**: User uploads a PDF. The file is streamed to Supabase   
Storage.                                                                 
2. **Analysis**: An Edge Function is triggered. It performs document     
analysis and communicates with the LLM to map text to the internal       
schema.                                                                  
3. **Refinement**: The structured JSON is returned to the React          
frontend.                                                                
4. **Editing**: The user modifies their data through an interactive UI.  
5. **Persistence**: Changes are synced back to the PostgreSQL database   
in real-time.                                                            
                                                                         
## Deployment                                                            
                                                                         
The project is optimized for **Netlify**. To deploy:                     
1. Connect your GitHub repository to Netlify.                            
2. Configure the build command as `npm run build` and the publish        
directory as `dist`.                                                     
3. Add your environment variables in the Netlify dashboard.              
4. Ensure your Supabase Edge Functions are deployed via `supabase        
functions deploy`. 
