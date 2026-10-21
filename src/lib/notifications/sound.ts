/** A quiet, half-second two-note chime; no downloaded audio or extra controls. */
export function playNotificationChime(context: AudioContext): boolean {
  if (context.state !== "running") return false;
  const start = context.currentTime + 0.01;
  for (const [frequency, offset] of [[880, 0], [660, 0.22]]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + offset);
    gain.gain.linearRampToValueAtTime(0.09, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.25);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.27);
  }
  return true;
}
