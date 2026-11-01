rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isWhitelisted() {
      return request.auth != null && 
        (request.auth.token.email == "patteri6907@gmail.com" ||
         exists(/databases/$(database)/documents/allowed_users/$(request.auth.token.email)));
    }
    
    function isAdmin() {
      return request.auth != null && 
        request.auth.token.email == "patteri6907@gmail.com";
    }

    match /allowed_users/{document=**} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }

    match /tasks/{taskId} {
      allow read, write: if isWhitelisted();
    }

    match /shopping_items/{itemId} {
      allow read, write: if isWhitelisted();
    }
  }
}