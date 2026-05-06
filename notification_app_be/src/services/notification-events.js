class NotificationEvents {
  constructor() {
    this.clientsByStudent = new Map();
  }

  addClient(studentId, req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const client = { res };
    const clients = this.clientsByStudent.get(studentId) || new Set();
    clients.add(client);
    this.clientsByStudent.set(studentId, clients);

    this.writeEvent(res, "connected", {
      studentID: studentId,
      connectedAt: new Date().toISOString(),
    });

    const heartbeat = setInterval(() => {
      this.writeEvent(res, "heartbeat", { at: new Date().toISOString() });
    }, 30000);

    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(client);

      if (clients.size === 0) {
        this.clientsByStudent.delete(studentId);
      }
    });
  }

  publish(studentId, notification) {
    const clients = this.clientsByStudent.get(studentId);

    if (!clients) {
      return;
    }

    for (const client of clients) {
      this.writeEvent(client.res, "notification", notification);
    }
  }

  writeEvent(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

module.exports = NotificationEvents;
