#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Session 2026-09-11 (fork) — main agent
frontend:
  - task: "Delete my data (Apple 5.1.1v) — Profile danger card + DELETE /api/profile"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/profile.tsx, frontend/src/lib/api.ts, backend/server.py"
    needs_retesting: true
    status_history:
      - agent: "main"
        comment: "Two-step inline confirm card (testID profile-delete-btn / profile-delete-confirm / profile-delete-cancel). Backend DELETE /api/profile erases profile+assessments+diagnostics. Backend verified via curl (200, profile null after)."
  - task: "Root ErrorBoundary"
    implemented: true
    working: "NA"
    file: "frontend/src/components/ErrorBoundary.tsx, frontend/app/_layout.tsx"
    needs_retesting: true
  - task: "Upstream 424 controlled 'reason' shown in assessment error (athleteId not found)"
    implemented: true
    working: "NA"
    file: "backend/server.py (_call_upstream athleteId forwarding), frontend/src/lib/api.ts (UpstreamError.reason), manual.tsx, guided.tsx"
    needs_retesting: true
    status_history:
      - agent: "main"
        comment: "ROOT CAUSE of Sept 10 06:50 failure: Replit now requires existing+owned athleteId in /api/assessments (500 without it, 404 if unknown). Backend now forwards athleteId+contextInterviewId. Real Replit has NO athlete for our token, so a valid submit correctly returns 424 with reason 'athleteId (N) not found' — THIS IS EXPECTED until user registers athlete upstream. Do NOT report 424 as a bug."
agent_communication:
  - agent: "main"
    message: "Backend fully verified via bash: pytest 23/23 pass; incomplete data returns controlled 400 messages (Falta lectura en t=Xs); no ghost records. Frontend needs UI verification only: onboarding -> create profile (with athleteId) -> profile tab delete-my-data flow, and assessment submit showing controlled 424 reason."
