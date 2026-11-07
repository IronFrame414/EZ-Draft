# S03d selected objects and S03c photo · approved wording

Josh approved the boards, this wording and the design choices on 2026-11-07 (Cowork; canvas "EZ Draft boards · S03d selected objects + S03c photo (Nov 7)", copied here from its approved-wording notes). On the boards, a dotted orange underline and a W or A number mark this wording. The boards' notes still say "proposed"; this list is what counts. Sizes, names, materials, rooms, the photo and its file name are sample data.

## S03d
- W1 Subtitle under the inspector title: room(s) · host wall. Wall: "Kitchen · Laundry" (rooms on each side). Door: "Laundry · Wall 7". Window: "Kitchen · Wall 1".
- W2 Wall, Layers: button "Edit layers"
- W4 Size sub-labels: "Width" / "Height"
- W5 Offset caption: "to the inside corner at [Wall n]"
- W6 Rough opening tag: "Auto"
- W7 Shutter: field "Shutter type" · sample options Accordion, Roll-down, Storm panel, Colonial, Bahama
- W8 Hand column labels: "Hinge left" / "Hinge right" (on a vertical wall: "Hinge top" / "Hinge bottom")
- W9 Swing row labels: "Into [room]" / "Outside" (interior door: "Into [room]" / "Into [other room]")
- W10 Result line: "Opens into Laundry · hinge on the left"
- W11 Hint: "Left and right as drawn on the plan. On the plan, click the arc to flip the swing, or the hinge dot to flip the hand."
- W12 Plan tooltips: "Click to flip swing" / "Click to flip hand"
- W13 Not on a wall, under it: "Drag it onto a wall, or delete it."
- W14 Bulk title: "3 walls selected" · mixed types: "4 objects selected" · subtitle "Changes apply to all 3."
- W15 Empty inspector: "Select something on the plan to see its details here."
- W16 Empty inspector hint: "Shift-click or drag a box to select more than one."
- W17 View-only badge: "View only"

Josh's own words, already decided: field names (Length, Thickness, Layers, Height, Status, Bearing, Size, Swing and Hand, Offset from corner, Rough opening, Impact rating, Sill height), Not rated / Impact rated / Shutter, "Not on a wall", "Mixed". The Door tool chip reuses the approved "Type a size or use the laser".

Design choices: box select left to right is a solid cobalt box and takes what is fully inside; right to left is a dashed green box and takes anything it touches.

## S03c photo
- A1 Attach control: "Photo" (photo icon) · screen-reader name "Attach a photo"
- A2 × on the thumbnail: "Remove photo"
- A3 Line under the prompt: "A photo goes to Anthropic only with the prompt you attach it to. Client name, address and prices are never sent."
- A4 Wrong file type: "EZ Draft can't use that file. Attach a JPG, PNG, HEIC or WebP photo."
- A5 Too big: "That photo is over 20 MB. Attach a smaller one."

Approved rules: accept JPG, PNG, HEIC and WebP, up to 20 MB each, one photo per prompt. EZ Draft shrinks the photo before sending and converts HEIC to JPG. It strips location data (GPS) from the photo. A photo goes only with the prompt it is attached to.
