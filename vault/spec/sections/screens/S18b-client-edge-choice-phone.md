### 18b · Client edge choice (phone)

**Purpose:** Client picks a countertop edge profile from the profiles the contractor offers; the choice flows back to the plan, top schedule and internal/client drawings (countertop sheets are not in permit drawings, Round 24).

**Entry points:** Client approval page (S18) Selections row "Countertop edge"; one step of the client selections flow.

**Permissions:** Client via share link (no verification needed to choose). Offered profiles and prices are set by a contractor user with Send to client (S04b "Edit offered edges"), under the edit lock (Claude).

**Layout:** Phone 390x844.

- Header: back arrow, "Your kitchen selections", "Worth Properties · Hendricks kitchen", step "2 of 4".
- Title "Choose your countertop edge"; material line "Quartz · \[Color\] · 3 cm thick".
- Large cross-section card with dimensions and profile name/description.
- Option list (radio rows).
- Mini plan of edges it applies to.
- Note on renders.
- Footer: Ask, Choose.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Back arrow | Header | Returns to S18 or the previous step. | A radio pick not confirmed with Choose is discarded (Claude). |
| Step indicator "n of m" | Header | Position in the flow; m = number of selection groups in this send. | Order set by the contractor (Claude). |
| Cross-section drawing | Card | Large section of the selected profile on the top over a cabinet; dims 1 1/2" (overhang) and 3 cm (thickness); name and one-line description. | Updates on option change. |
| Option row: Eased | Option list | Selects; "Included". | Radio. |
| Option row: Half bullnose | Option list | Selects; price difference as a total, e.g. `+$[ ]`. | Total = per-LF price x exposed LF (Round 24 #33). |
| Option row: Ogee | Option list | Selects; total price difference `+$[ ]`. |  |
| Mini plan | Below list | Blue edges show where the profile applies; "about 33 linear ft". | Exposed edges only (plan Round 23). |
| Render note | Below plan | "Your renderings show a square edge. The edge you pick is listed beside each rendering and on the drawings." | Renders do not model edges. |
| Ask | Footer | Opens a comment to the contractor tied to this selection. | Same notification as comments. |
| Choose \<profile> | Footer, primary | Saves the choice; label follows the selection ("Choose Half bullnose"); goes to the next step or back to S18 after the last. | Disabled with nothing selected. Not an approval (Round 24). |

**Data shown:** offered edge profiles (subset of eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom), total price difference, top material and thickness, exposed edge LF, edge plan.

**States:** loading, chosen (check on the chosen row, button reads "Chosen"), locked after S18 approval (read-only), expired link, error, offline.

**Validation & warnings:** One profile required to continue.

**Events emitted:** selection.option\_chosen (new) with item "countertop edge", profile, price delta total; S04b "Edge profile: client choosing" updates to the chosen profile and the top schedule updates.

**Decisions:**

1. Price difference shows as a total (per-LF rate x exposed LF); the contractor enters the rate per LF on S04b (Round 24).
2. Clients see this sell-price difference only; costs and markup stay internal (Round 24, Claude).
3. The flow has one step per selection group in the send, in the order the contractor sets; the mockup's 4 steps are an example (Claude).
4. Choose saves a choice only; approval happens on S18 with verification and signature (Round 24).
5. Client pages use the project name as set in EZ Draft ("Hendricks kitchen") on every screen (Claude).
