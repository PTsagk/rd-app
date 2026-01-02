import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  constructor(private http: HttpClient) {}
  get(url: string) {
    return this.http.get(url);
  }

  post(url: string, body: any) {
    return this.http.post('http://localhost:3000' + url, body);
  }
}
