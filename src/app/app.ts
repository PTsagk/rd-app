import { NgClass, NgStyle } from '@angular/common';
import { Component, signal, ViewEncapsulation, HostListener } from '@angular/core';

@Component({
  selector: 'app-root',
  imports: [NgStyle, NgClass],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None,
})
export class App {
  private ipc = (window as any).require('electron').ipcRenderer;
  isExpanded = signal(false);

  constructor() {}

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Trigger expand with Cmd+Shift+I (or Ctrl+Shift+I on Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === 'R') {
      event.preventDefault();
      this.toggleExpand();
    }
  }

  toggleExpand() {
    if (this.isExpanded()) {
      this.contract();
    } else {
      this.expand();
    }
  }

  expand() {
    // Width: 400px, Height: 120px when hovering
    this.ipc.send('resize-island', { width: 420, height: 220 });
    this.isExpanded.set(true);
    console.log('Expanding island');
  }

  contract() {
    // Back to original size
    this.ipc.send('resize-island', { width: 180, height: 30 });
    this.isExpanded.set(false);
  }
}
