const { initializeApp, getApps, getApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateEmail, updatePassword, sendPasswordResetEmail, isSignInWithEmailLink } = require('firebase/auth');
const { getFirestore, collection, doc, setDoc, getDoc, updateDoc } = require('firebase/firestore');
const Boom = require('@hapi/boom');
const admin = require('firebase-admin');
const firebaseConfig = require('./firebaseConfig');

if (!getApps().length) {
    initializeApp(firebaseConfig);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);

//User Register 
const registerHandler = async (request, h) => {
    const { email, password } = request.payload;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userDoc = doc(db, 'users', user.uid);
        await setDoc(userDoc, {
            email
        });

        // Create 'foods' subcollection inside 'users' document
        const foodsCollection = collection(db, 'users', user.uid, 'foods-history');
        const newFoodDoc = doc(foodsCollection);
        await setDoc(newFoodDoc, {
            userID: user.uid
        });

        return h.response({ success: true, message: 'User registered successfully', data: { uid: user.uid, email: user.email }}).code(201);
    } catch (error) {
        console.error({ success: false, message: 'Something went wrong:', error});

        if (error.code === 'auth/email-already-in-use') {
            // Handle email already in use error
            return h.response({ success: false, message: 'The email address is already in use'}).code(400);
        } else {
            throw error;
        }
    }
};

//User Login
const loginHandler = async (request, h) => {
    const { email, password } = request.payload;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const idToken = await user.getIdToken();

        return h.response({ success: true, message: 'Login Successfully', data: {uid: user.uid, email: user.email, accessToken: idToken} }).code(200);
    } catch (error) {
        console.error('Error logging in user:', error);

        if (error.code === 'auth/user-not-found') {
            return h.response({ success: false, message: 'User not found'}).code(400);
        } else if (error.code === 'auth/wrong-password') {
            return h.response({ success: false, message: 'Email and password does not match'}).code(401);
        } else {
            throw error;
        }
    }
};

//Verifying User TokenId
const verifyTokenHandler = async (request, h) => {
    const idToken = request.headers.authorization;

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        console.log({success: true, message: 'Token is valid'});
        request.user = decodedToken;
        return h.continue;
    } catch (error) {
        console.error({ success: false, message: 'Error verifying token', error});
        throw Boom.unauthorized('Invalid token');
    }
};

//User Logout
const logoutHandler = async (request, h) => {

    try {
        await signOut(auth);
        return h.response({ success: true, message: 'Logged out successfully' }).code(200);
    } catch (error) {
        console.error('Error logging out user:', error);
        return h.response({ success: false, message: 'Something went wrong' }).code(400);
    }

};

//Get User Info By Id
const getUserByIdHandler = async (request, h) => {
    const { uid } = request.params;

    try {
        const userDoc = doc(db, 'users', uid);
        const docSnap = await getDoc(userDoc);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            return h.response({ success: true, message: 'Success fetching user data', data: { uid: uid, email: data.email }}).code(200);
        } else {
            return h.response({ success: false, message: 'User not found'}).code(404);
        }
    } catch (error) {
        console.error({ success: false, message: 'Error fetching user data:', error});
        return h.response({ success: false, message: 'Error fetching user data'}).code(500);
    }
};

//Edit User Data, email and password
const editUserDataHandler = async (request, h) => {
    const { uid } = request.params;
    const { email, password, currentEmail, currentPassword } = request.payload;

    try {
        const { user } = await signInWithEmailAndPassword(auth, currentEmail, currentPassword);

        // Compare the user's UID with the provided UID
        if (user.uid === uid) {
            // Update user data in Firestore
            const userDoc = doc(db, 'users', uid);
            const updateData = {};
            if (email) updateData.email = email;

            await updateDoc(userDoc, updateData);

            // Update user data
            if (email) await updateEmail(user, email);
            if (password) await updatePassword(user, password);

            return h.response({ success: true, message: 'Profile updated successfully', data: { uid: uid, email: isSignInWithEmailLink } }).code(200);
        } else {
            // The signed-in user's UID does not match the provided UID
            return h.response({ success: false, message: 'You don\'t have permission to edit this account' }).code(403);
        }
    } catch (error) {
        console.error('Error updating profile:', error);

        if (error.code === 'auth/user-not-found') {
            return h.response({ success: false, message: 'User not found' }).code(400);
        } else {
            throw error;
        }
    }
};

//Reset User Password
const resetPasswordHandler = async (request, h) => {
    const { email } = request.payload;
    try {
        await sendPasswordResetEmail(auth, email);
        console.log({ success: true, message: 'Password reset email sent to:', email});
        return h.response({ success: true, message: 'We have sent email to reset your password', data: { email: email } }).code(200);
    } catch (error) {
        console.log({ success: false, message: 'Error sending password reset email:', error});

        if (error.code === 'auth/user-not-found') {
            // Handle email already in use error
            return h.response({ success: false, message: 'User not found'}).code(404);
        } else {
            throw error;
        }
    }
}

module.exports = {
    registerHandler,
    loginHandler,
    verifyTokenHandler,
    logoutHandler,
    getUserByIdHandler,
    editUserDataHandler,
    resetPasswordHandler
};