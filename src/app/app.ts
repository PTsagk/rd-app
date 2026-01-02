import { NgClass, NgStyle } from '@angular/common';
import { Component, signal, OnDestroy, ElementRef, AfterViewInit } from '@angular/core';
import { Chat } from './components/chat/chat';
import { InferenceClient } from '@huggingface/inference';
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
  private silenceDuration = 2000; // 2 seconds in milliseconds

  isExpanded = signal(false);
  isRecording = signal(false);
  isWaiting = signal(false);

  constructor(private elementRef: ElementRef) {}

  async ngAfterViewInit() {
    // Initialize after view is ready
    this.ipc.on('toggle-expand', async (event: any, expand: boolean) => {
      this.isExpanded.set(expand);
      console.log('Toggling expand:', expand);
      if (this.isExpanded()) {
        try {
          console.log('Requesting microphone access');
          this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.isRecording.set(true);
          console.log('Microphone activated');

          // Set up audio analysis
          this.setupAudioAnalysis();
        } catch (error) {
          console.error('Error accessing microphone:', error);
        }
      } else {
        this.stopRecording();
      }
    });
    this.ipc.on('reset', () => {
      this.reset();
    });
    this.reset();
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

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.speechToText();

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
  }

  async speechToText() {
    // this.reset();
  }
}
