Gate spoken-line audio
======================

Drop one audio file per gate here. They play when the student passes each gate,
in this order (see GATE_LINE_SRCS in three-rowing.js):

  gate-1.mp3   -> Ciao Gate       "Ciao, Venice!"
  gate-2.mp3   -> Rialto Bridge   "I row under the bridge."
  gate-3.mp3   -> Glass Window    "I see colorful glass."
  gate-4.mp3   -> Pizza Stop      "Italy has pizza."
  gate-5.mp3   -> Museum Dock     "I made it to the museum!"

Notes
-----
- Format: .mp3. Works on Safari/iPad, Chrome, Edge.
- Keep each clip short (1-3 seconds).
- Missing files are skipped automatically (no error), so you can add them one
  at a time.
- To change filenames or order, edit GATE_LINE_SRCS in three-rowing.js.
