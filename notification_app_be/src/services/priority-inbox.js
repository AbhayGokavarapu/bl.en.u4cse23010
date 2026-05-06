const TYPE_WEIGHT = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

function parseTimestamp(notification) {
  const normalized = String(notification.Timestamp || "").replace(" ", "T");
  const parsed = Date.parse(normalized);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function getPriorityScore(notification) {
  const typeWeight = TYPE_WEIGHT[notification.Type] || 0;
  const timestampMs = parseTimestamp(notification);

  return {
    typeWeight,
    timestampMs,
  };
}

function comparePriority(a, b) {
  const left = getPriorityScore(a);
  const right = getPriorityScore(b);

  if (left.typeWeight !== right.typeWeight) {
    return left.typeWeight - right.typeWeight;
  }

  if (left.timestampMs !== right.timestampMs) {
    return left.timestampMs - right.timestampMs;
  }

  return String(a.ID).localeCompare(String(b.ID));
}

function isHigherPriority(a, b) {
  return comparePriority(a, b) > 0;
}

class TopNPriorityInbox {
  constructor(limit = 10) {
    this.limit = limit;
    this.heap = [];
    this.seenIds = new Set();
  }

  add(notification) {
    if (!notification || !notification.ID || this.seenIds.has(notification.ID)) {
      return;
    }

    this.seenIds.add(notification.ID);

    if (this.heap.length < this.limit) {
      this.heap.push(notification);
      this.bubbleUp(this.heap.length - 1);
      return;
    }

    if (isHigherPriority(notification, this.heap[0])) {
      this.heap[0] = notification;
      this.bubbleDown(0);
    }
  }

  addMany(notifications) {
    notifications.forEach((notification) => this.add(notification));
  }

  toSortedArray() {
    return [...this.heap].sort((a, b) => comparePriority(b, a));
  }

  bubbleUp(index) {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);

      if (comparePriority(this.heap[currentIndex], this.heap[parentIndex]) >= 0) {
        break;
      }

      this.swap(currentIndex, parentIndex);
      currentIndex = parentIndex;
    }
  }

  bubbleDown(index) {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = currentIndex * 2 + 2;
      let smallestIndex = currentIndex;

      if (
        leftIndex < this.heap.length &&
        comparePriority(this.heap[leftIndex], this.heap[smallestIndex]) < 0
      ) {
        smallestIndex = leftIndex;
      }

      if (
        rightIndex < this.heap.length &&
        comparePriority(this.heap[rightIndex], this.heap[smallestIndex]) < 0
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === currentIndex) {
        break;
      }

      this.swap(currentIndex, smallestIndex);
      currentIndex = smallestIndex;
    }
  }

  swap(leftIndex, rightIndex) {
    const temp = this.heap[leftIndex];
    this.heap[leftIndex] = this.heap[rightIndex];
    this.heap[rightIndex] = temp;
  }
}

function findTopPriorityNotifications(notifications, limit = 10) {
  const inbox = new TopNPriorityInbox(limit);
  inbox.addMany(notifications);

  return inbox.toSortedArray();
}

module.exports = {
  TYPE_WEIGHT,
  TopNPriorityInbox,
  comparePriority,
  findTopPriorityNotifications,
  getPriorityScore,
};

