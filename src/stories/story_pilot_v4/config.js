// story_pilot_v4: V4.1 storytelling motion pilot. Vertical 9:16, 15 s, 24 fps, watercolor look, no music.
// Narration timing is provisional (see STORYBOARD.md): when a narration file exists, set audio to its path and retime
// NARRATION / CUE in story.js to its measured timing. Typography is used selectively as live text (never in artwork).
const PROJECT = { width: 1080, height: 1920, aspect: '9:16', duration: 15, bpm: 90, offset: 0, audio: '', look: 'watercolor',
  files: ['src/stories/one_message/art.js', 'art.js', 'story.js'] };
