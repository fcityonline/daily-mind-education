// frontend/src/utils/notifications.js

/**
 * Request notification permission from user
 */
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

/**
 * Show a notification
 */
export const showNotification = (title, options = {}) => {
  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      icon: '/imgs/logo-DME.png',
      badge: '/imgs/logo-DME.png',
      ...options
    });

    // Auto close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    return notification;
  }
  return null;
};

/**
 * Show quiz ready notification
 */
export const showQuizReadyNotification = (quizData) => {
  return showNotification('Quiz Starting Soon!', {
    body: `Daily quiz starts in 1 minute! ${quizData.totalQuestions} questions, ${quizData.timePerQuestion}s each.`,
    tag: 'quiz-ready',
    requireInteraction: true,
    actions: [
      {
        action: 'join',
        title: 'Join Now'
      }
    ]
  });
};

/**
 * Show quiz started notification
 */
export const showQuizStartedNotification = (quizData) => {
  return showNotification('Quiz Started!', {
    body: `Daily quiz is now live! Join now to participate.`,
    tag: 'quiz-started',
    requireInteraction: true,
    actions: [
      {
        action: 'join',
        title: 'Join Quiz'
      }
    ]
  });
};
