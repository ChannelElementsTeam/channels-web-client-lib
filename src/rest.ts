export class Rest {
  static async get<T>(url: string, headers?: { [key: string]: string }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const req = new XMLHttpRequest();
      req.withCredentials = false;
      req.open("GET", url);
      if (headers) {
        for (const key in headers) {
          if (headers.hasOwnProperty(key)) {
            req.setRequestHeader(key, headers[key]);
          }
        }
      }
      req.onload = (event) => {
        const status = req.status;
        if (status === 0 || status >= 400) {
          if (req.responseText) {
            Rest.onError(reject, status, req.responseText);
          } else {
            Rest.onError(reject, status, 'Request failed with code: ' + status);
          }
        } else {
          if (req.responseText) {
            const result = JSON.parse(req.responseText) as T;
            resolve(result);
          } else {
            resolve(null);
          }
        }
      };
      req.onerror = (err) => {
        Rest.onError(reject, 0, "There was a network error: " + err.message);
      };
      req.send();
    });
  }

  static async post<T>(url: string, object: any, headers?: { [key: string]: string }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const req = new XMLHttpRequest();
      req.withCredentials = false;
      req.open("POST", url);
      if (headers) {
        for (const key in headers) {
          if (headers.hasOwnProperty(key)) {
            req.setRequestHeader(key, headers[key]);
          }
        }
      }
      req.setRequestHeader("Content-Type", 'application/json');
      req.onload = (event) => {
        const status = req.status;
        if (status === 0 || status >= 400) {
          if (req.responseText) {
            Rest.onError(reject, status, req.responseText);
          } else {
            Rest.onError(reject, status, 'Request failed with code: ' + status);
          }
        } else {
          if (req.responseText) {
            const result = JSON.parse(req.responseText) as T;
            resolve(result);
          } else {
            resolve(null);
          }
        }
      };
      req.onerror = (err) => {
        Rest.onError(reject, 0, "There was a network error: " + err.message);
      };
      if (object) {
        req.send(JSON.stringify(object));
      } else {
        req.send();
      }
    });
  }

  static async delete<T>(url: string, headers?: { [key: string]: string }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const req = new XMLHttpRequest();
      req.withCredentials = false;
      req.open("DELETE", url);
      if (headers) {
        for (const key in headers) {
          if (headers.hasOwnProperty(key)) {
            req.setRequestHeader(key, headers[key]);
          }
        }
      }
      req.setRequestHeader("Content-Type", 'application/json');
      req.onload = (event) => {
        const status = req.status;
        if (status === 0 || status >= 400) {
          if (req.responseText) {
            Rest.onError(reject, status, req.responseText);
          } else {
            Rest.onError(reject, status, 'Request failed with code: ' + status);
          }
        } else {
          if (req.responseText) {
            const result = JSON.parse(req.responseText) as T;
            resolve(result);
          } else {
            resolve(null);
          }
        }
      };
      req.onerror = (err) => {
        Rest.onError(reject, 0, "There was a network error: " + err.message);
      };
      req.send();
    });
  }

  private static onError(reject: (reason?: any) => void, code: number, message: string) {
    reject({
      status: code,
      message: message
    });
  }
}
