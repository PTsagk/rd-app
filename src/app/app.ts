import { NgClass, NgStyle } from '@angular/common';
import { Component, signal, OnDestroy, ElementRef, AfterViewInit } from '@angular/core';
import { Chat } from './components/chat/chat';
import { ApiService } from './services/api.service';
import { marked } from 'marked';
@Component({
  selector: 'app-root',
  imports: [NgStyle, NgClass, Chat],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  // encapsulation: ViewEncapsulation.None,
})
export class App implements OnDestroy, AfterViewInit {
  private ipc = (window as any).require('electron').ipcRenderer;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationFrameId: number | null = null;
  private silenceTimeout: any = null;
  private silenceThreshold = 50; // Audio level threshold for silence
  private silenceDuration = 3000; // 3 seconds in milliseconds
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  isExpanded = signal(false);
  isRecording = signal(false);
  isWaiting = signal(false);
  islandHeight = signal(120);
  modelResponse = signal<string | null>(null);

  constructor(private elementRef: ElementRef, private api: ApiService) {}

  async ngAfterViewInit() {
    // Initialize after view is ready
    this.ipc.on('toggle-expand', async (event: any, expand: boolean) => {
      this.isExpanded.set(expand);
      console.log('Toggling expand:', expand);
      if (!this.isExpanded()) {
        this.stopRecording();
      }
    });
    this.ipc.on('reset', () => {
      this.reset();
    });
    this.ipc.on('new-recording', () => {
      this.startRecordingProcess();
    });
  }

  private async startRecordingProcess() {
    try {
      console.log('Requesting microphone access');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.isRecording.set(true);
      console.log('Microphone activated');

      // Set up audio analysis
      this.setupAudioAnalysis();

      // Start recording
      this.startRecording();
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  }

  private setupAudioAnalysis() {
    console.log('Setting up audio analysis');
    if (!this.mediaStream) return;

    // Create audio context
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Create analyser
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);

    source.connect(this.analyser);

    // Start animation loop
    this.animateWaves();
  }

  private startRecording() {
    if (!this.mediaStream) return;

    this.audioChunks = [];
    this.mediaRecorder = new MediaRecorder(this.mediaStream);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start();
    console.log('MediaRecorder started');
  }

  private animateWaves() {
    if (!this.analyser || !this.dataArray) return;
    console.log('Starting wave animation');
    const animate = () => {
      if (!this.isRecording()) return;

      // @ts-ignore
      this.analyser!.getByteFrequencyData(this.dataArray!);

      // Calculate average volume to detect silence
      const average = this.dataArray!.reduce((a, b) => a + b, 0) / this.dataArray!.length;
      const isSilent = average < this.silenceThreshold;

      // Handle silence detection
      if (isSilent) {
        // Start silence timer if not already started
        if (!this.silenceTimeout) {
          console.log('Silence detected, starting timer...');
          this.silenceTimeout = setTimeout(() => {
            console.log('2 seconds of silence - stopping recording');
            this.stopRecording();
            // Trigger contract animation
            // this.ipc.send('wait-answer');
            this.isWaiting.set(true);
          }, this.silenceDuration);
        }
      } else {
        // Clear silence timer if sound is detected
        if (this.silenceTimeout) {
          console.log('Sound detected, clearing silence timer');
          clearTimeout(this.silenceTimeout);
          this.silenceTimeout = null;
        }
      }

      // Get wave elements
      const waves = this.elementRef.nativeElement.querySelectorAll('[class*="wave"]');

      // Update each wave based on frequency data
      waves.forEach((wave: HTMLElement, index: number) => {
        let scaleFactor: number;

        if (isSilent) {
          // When silent, make first and last waves slightly bigger
          if (index === 0 || index === waves.length - 1) {
            scaleFactor = 0.7;
          } else {
            scaleFactor = 0.5;
          }
        } else {
          // Map frequency bands to waves (0-6)
          const dataIndex = Math.floor((index / 7) * this.dataArray!.length);
          const amplitude = this.dataArray![dataIndex] / 255;
          scaleFactor = 0.5 + amplitude * 1.5;
        }

        wave.style.setProperty('--wave-scale', scaleFactor.toString());
      });

      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  private stopRecording() {
    // Clear silence timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      console.log('MediaRecorder stopped');
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      // Process audio after stopping
      setTimeout(() => {
        this.speechToText();
      }, 100);

      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
      this.isRecording.set(false);
      console.log('Microphone deactivated');
    }

    // Reset wave animations
    const waves = this.elementRef.nativeElement.querySelectorAll('[class*="wave"]');
    waves.forEach((wave: HTMLElement) => {
      wave.style.removeProperty('--wave-scale');
    });
  }

  ngOnDestroy() {
    // Cleanup on component destroy
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.audioContext) {
      this.audioContext.close();
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
  }
  reset() {
    this.isWaiting.set(false);
    this.isRecording.set(false);
    this.isExpanded.set(false);
    this.modelResponse.set(null);
    this.stopRecording();
    this.islandHeight.set(120);
  }

  private async convertToWav(audioBlob: Blob): Promise<string> {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get audio data
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numberOfChannels * 2;

    // Create WAV buffer
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Write PCM samples
    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    const wavBlob = new Blob([buffer], { type: 'audio/wav' });
    const base64 = await this.blobToBase64(wavBlob);

    return base64;
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async speechToText() {
    if (this.audioChunks.length === 0) {
      console.error('No audio chunks recorded');
      this.reset();
      return;
    }

    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    console.log('Audio blob size:', audioBlob.size);

    try {
      const base64Audio = await this.convertToWav(audioBlob);
      console.log('Audio converted to WAV and encoded to base64');

      this.api
        .post('/openai/chat', {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: base64Audio,
                    format: 'wav',
                  },
                },
              ],
            },
          ],
        })
        .subscribe({
          next: (response: any) => {
            console.log('OpenAI response:', response);
            response = marked(response);
            this.modelResponse.set(response);
            this.isWaiting.set(false);
            this.ipc.send('resize-island', {
              width: 600,
              height: response.length / 2 < 200 ? 200 : response.length / 2,
            });
            this.islandHeight.set(response.length / 2 < 200 ? 200 : response.length / 2);
            // this.reset();
          },
          error: (error) => {
            console.error('Error sending audio to OpenAI:', error);
            this.reset();
          },
        });
    } catch (error) {
      console.error('Error converting audio to WAV:', error);
      this.reset();
    }
  }
}
