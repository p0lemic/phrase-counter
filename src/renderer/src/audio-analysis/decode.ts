export interface DecodedAudio {
  monoSamples: Float32Array
  sampleRate: number
  durationSec: number
}

function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  // Copied even when there's nothing to mix: getChannelData hands back the AudioBuffer's own
  // memory, and transferring that to an analysis worker would detach it out from under the buffer
  // (the same trap as commit c7eb02a, where decodeAudioData detached the buffer wavesurfer needed).
  if (audioBuffer.numberOfChannels === 1) return new Float32Array(audioBuffer.getChannelData(0))

  const mono = new Float32Array(audioBuffer.length)
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel)
    for (let i = 0; i < channelData.length; i++) {
      mono[i] += channelData[i] / audioBuffer.numberOfChannels
    }
  }
  return mono
}

export async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<DecodedAudio> {
  const audioContext = new OfflineAudioContext(1, 1, 44100)
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  return {
    monoSamples: mixToMono(audioBuffer),
    sampleRate: audioBuffer.sampleRate,
    durationSec: audioBuffer.duration
  }
}
