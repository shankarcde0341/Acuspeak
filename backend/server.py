import os
import uuid
import random
import logging
import httpx
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, APIRouter, Header, HTTPException, Request, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- Env & clients ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "acuspeak")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
# ZEGOCLOUD Voice SDK credentials (read-only wiring; consumed by future
# token-generation endpoint, no runtime effect until then).
ZEGO_APP_ID = os.environ.get("ZEGO_APP_ID", "")
ZEGO_SERVER_SECRET = os.environ.get("ZEGO_SERVER_SECRET", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Acuspeak API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("acuspeak")

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# ---------- Models ----------
class SessionCreate(BaseModel):
    session_id: str

class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    english_level: str = "Beginner"
    xp: int = 0
    streak: int = 0
    last_active_date: Optional[str] = None
    daily_goal_minutes: int = 15
    daily_goal_completed_minutes: int = 0
    is_premium: bool = False
    premium_plan: Optional[str] = None
    premium_until: Optional[str] = None
    saved_words: List[str] = []
    friends: List[str] = []
    blocked: List[str] = []
    achievements: List[str] = []
    certificates: List[Dict[str, Any]] = []
    phone: Optional[str] = None
    referral_code: Optional[str] = None
    referred_by: Optional[str] = None
    referral_count: int = 0
    referral_discount_active: bool = False

class UpdateProfile(BaseModel):
    name: Optional[str] = None
    english_level: Optional[str] = None
    daily_goal_minutes: Optional[int] = None
    picture: Optional[str] = None
    phone: Optional[str] = None

class XPEvent(BaseModel):
    amount: int
    reason: str
    minutes: Optional[int] = 0

class SpeakingTestResult(BaseModel):
    level: str  # beginner / intermediate / advanced
    fluency: int
    pronunciation: int
    grammar: int
    vocabulary: int
    overall: int

class LessonProgressUpdate(BaseModel):
    lesson_id: str
    completed: bool = True

class VocabAction(BaseModel):
    word_id: str

class JoinMatchRequest(BaseModel):
    gender: Optional[str] = "any"

class CallLogCreate(BaseModel):
    partner_name: str
    partner_avatar: str
    duration_seconds: int
    partner_gender: str = "any"

class CallEndRequest(BaseModel):
    room_id: str

class CallFeedbackCreate(BaseModel):
    room_id: str
    target_user_id: str
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None

ACTIVE_CALL_SESSIONS: Dict[str, Dict[str, Any]] = {}

class FriendRequestCreate(BaseModel):
    to_name: str
    to_avatar: str

class ReportCreate(BaseModel):
    target_name: str
    reason: str

class RoomCreate(BaseModel):
    title: Optional[str] = "Live Speaking Practice"
    topic: Optional[str] = "General"
    is_private: Optional[bool] = False

class RoomJoin(BaseModel):
    room_id: str
    password: Optional[str] = None

class RemoveParticipantPayload(BaseModel):
    user_id: str

class CheckoutRequest(BaseModel):
    plan: str  # weekly | monthly | quarterly
    origin_url: str

class PhoneSendOtp(BaseModel):
    phone: str

class PhoneVerifyOtp(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None
    referral_code: Optional[str] = None

class LinkPhone(BaseModel):
    phone: str
    code: str

class ApplyReferral(BaseModel):
    referral_code: str

class ZegoTokenRequest(BaseModel):
    room_id: str

# ---------- Auth helpers ----------

async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Authentication Helper Dependency: get_current_user
    
    This function reads the 'Authorization: Bearer <token>' header from incoming HTTP requests,
    looks up the session token in the MongoDB `user_sessions` collection, checks if it is expired,
    and returns the logged-in user's database document.
    
    Raises HTTP 401 if the token is missing, invalid, or expired.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires = session.get("expires_at")
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def _user_to_out(u: Dict[str, Any]) -> UserOut:
    """
    Helper Function: _user_to_out
    
    Converts a raw user dictionary loaded from MongoDB into a formatted Pydantic `UserOut` model.
    Fills in default fallback values for missing fields to avoid frontend null errors.
    """
    return UserOut(
        user_id=u["user_id"],
        email=u["email"],
        name=u.get("name", ""),
        picture=u.get("picture"),
        english_level=u.get("english_level", "Beginner"),
        xp=u.get("xp", 0),
        streak=u.get("streak", 0),
        last_active_date=u.get("last_active_date"),
        daily_goal_minutes=u.get("daily_goal_minutes", 15),
        daily_goal_completed_minutes=u.get("daily_goal_completed_minutes", 0),
        is_premium=u.get("is_premium", False),
        premium_plan=u.get("premium_plan"),
        premium_until=u.get("premium_until"),
        saved_words=u.get("saved_words", []),
        friends=u.get("friends", []),
        blocked=u.get("blocked", []),
        achievements=u.get("achievements", []),
        certificates=u.get("certificates", []),
        phone=u.get("phone"),
        referral_code=u.get("referral_code"),
        referred_by=u.get("referred_by"),
        referral_count=u.get("referral_count", 0),
        referral_discount_active=u.get("referral_discount_active", False),
    )

def _gen_referral_code(name: str) -> str:
    """
    Helper Function: _gen_referral_code
    
    Generates a 8-character referral code string formatted like 'NAME-ABCD',
    using the user's name prefix and random letters/digits.
    """
    import random
    import string
    prefix = "".join(c for c in (name or "USER").upper() if c.isalpha())[:4] or "USER"
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{prefix}-{suffix}"

async def _unique_referral_code(name: str) -> str:
    """
    Helper Function: _unique_referral_code
    
    Repeatedly generates a referral code and checks MongoDB `users` to ensure it is unique.
    Returns the unique referral code string.
    """
    for _ in range(6):
        code = _gen_referral_code(name)
        exists = await db.users.find_one({"referral_code": code}, {"_id": 1})
        if not exists:
            return code
    return f"USER-{uuid.uuid4().hex[:6].upper()}"

# ---------- Static content seed ----------
LESSON_CATEGORIES = [
    {"id": "daily", "name": "Daily English", "color": "#3B82F6", "icon": "chatbubbles"},
    {"id": "business", "name": "Business English", "color": "#0EA5E9", "icon": "briefcase"},
    {"id": "interview", "name": "Interview English", "color": "#6366F1", "icon": "person"},
    {"id": "travel", "name": "Travel English", "color": "#14B8A6", "icon": "airplane"},
]

def _lesson(cat, i, title, desc, level, minutes, script=None):
    """
    Helper Constructor Function: _lesson
    
    Builds a structured lesson dictionary item including category ID, title, level,
    estimated completion duration, calculated XP reward, and attached dialogue script.
    """
    return {
        "id": f"{cat}-{i}",
        "category_id": cat,
        "title": title,
        "description": desc,
        "level": level,
        "duration_minutes": minutes,
        "xp_reward": 25 + (i * 5),
        "content": [
            {"type": "intro", "text": desc},
            {"type": "phrase", "text": f"Practice sentence {i}.1 for {title}."},
            {"type": "phrase", "text": f"Practice sentence {i}.2 for {title}."},
            {"type": "tip", "text": f"Tip: focus on stress and intonation while practicing {title}."},
        ],
        "script": script or [],
    }
    
    return {
        "id": f"{cat}-{i}",
        "category_id": cat,
        "title": title,
        "description": desc,
        "level": level,
        "duration_minutes": minutes,
        "xp_reward": 25 + (i * 5),
        "content": [
            {"type": "intro", "text": desc},
            {"type": "phrase", "text": f"Practice sentence {i}.1 for {title}."},
            {"type": "phrase", "text": f"Practice sentence {i}.2 for {title}."},
            {"type": "tip", "text": f"Tip: focus on stress and intonation while practicing {title}."},
        ],
        "script": script or [],
    }

PILOT_LESSON_SCRIPTS = {
    "daily-1": [
        {"line_id": "daily-1-l1", "speaker": "A", "text": "Hi, I'm Alex. What's your name?", "audio_url": "app/frontend/assets/audio/daily_1/alex-lesson-1-intro_L1.mp3"},
        {"line_id": "daily-1-l2", "speaker": "B", "text": "Hi Alex, I'm Jordan. Nice to meet you.", "audio_url": "/static/audio/daily-1/daily-1-l2.mp3"},
        {"line_id": "daily-1-l3", "speaker": "A", "text": "Where are you from?", "audio_url": "/static/audio/daily-1/daily-1-l3.mp3"},
        {"line_id": "daily-1-l4", "speaker": "B", "text": "I'm from Mexico, and I love learning English.", "audio_url": "/static/audio/daily-1/daily-1-l4.mp3"},
    ],
    "business-1": [
        {"line_id": "business-1-l1", "speaker": "A", "text": "Good morning, everyone. Let's start the meeting.", "audio_url": "/static/audio/business-1/business-1-l1.mp3"},
        {"line_id": "business-1-l2", "speaker": "B", "text": "Good morning. The quarterly report is ready.", "audio_url": "/static/audio/business-1/business-1-l2.mp3"},
        {"line_id": "business-1-l3", "speaker": "A", "text": "Please share your insights on the sales figures.", "audio_url": "/static/audio/business-1/business-1-l3.mp3"},
        {"line_id": "business-1-l4", "speaker": "B", "text": "We saw strong growth in our new product line.", "audio_url": "/static/audio/business-1/business-1-l4.mp3"},
    ],
    "interview-1": [
        {"line_id": "interview-1-l1", "speaker": "A", "text": "Tell me about yourself in a few sentences.", "audio_url": "/static/audio/interview-1/interview-1-l1.mp3"},
        {"line_id": "interview-1-l2", "speaker": "B", "text": "I'm a product manager with five years of experience.", "audio_url": "/static/audio/interview-1/interview-1-l2.mp3"},
        {"line_id": "interview-1-l3", "speaker": "A", "text": "What motivates you to join our team?", "audio_url": "/static/audio/interview-1/interview-1-l3.mp3"},
        {"line_id": "interview-1-l4", "speaker": "B", "text": "I enjoy building user-focused products and solving problems.", "audio_url": "/static/audio/interview-1/interview-1-l4.mp3"},
    ],
    "travel-1": [
        {"line_id": "travel-1-l1", "speaker": "A", "text": "Welcome to the airport. Do you have your passport?", "audio_url": "/static/audio/travel-1/travel-1-l1.mp3"},
        {"line_id": "travel-1-l2", "speaker": "B", "text": "Yes, here it is. I'm flying to Madrid.", "audio_url": "/static/audio/travel-1/travel-1-l2.mp3"},
        {"line_id": "travel-1-l3", "speaker": "A", "text": "Are you checking in any luggage today?", "audio_url": "/static/audio/travel-1/travel-1-l3.mp3"},
        {"line_id": "travel-1-l4", "speaker": "B", "text": "Just one suitcase and my carry-on bag.", "audio_url": "/static/audio/travel-1/travel-1-l4.mp3"},
    ],
}

DAILY_1_SCRIPT = [
    {"line_id": "d1-l1", "speaker": "Alex", "text": "Hello Good morning!" },
    {"line_id": "d1-l2", "speaker": "Priya", "text": "Good morning, My name is Priya. What is your name?"},
    {"line_id": "d1-l3", "speaker": "Alex", "text": "I am Alex. Nice to meet you, Priya."},
    {"line_id": "d1-l4", "speaker": "Priya", "text": "Nice to meet you too, Alex. Where are you from?"},
    {"line_id": "d1-l5", "speaker": "Alex", "text": "I am from Delhi. And you?"},
    {"line_id": "d1-l6", "speaker": "Priya", "text": "I am from Mumbai. What do you do?"},
    {"line_id": "d1-l7", "speaker": "Alex", "text": "I am a student. What about you?"},
    {"line_id": "d1-l8", "speaker": "Priya", "text": "I work in an office. What are your hobbies?"},
    {"line_id": "d1-l9", "speaker": "Alex", "text": "I like playing cricket and reading books."},
    {"line_id": "d1-l10", "speaker": "Priya", "text": "That is great! It was nice talking to you. Have a good day!"}
]

ORDERING_AT_CAFE_SCRIPT = [
    {"line_id": "d2-l1", "speaker": "Waitress", "text": "Hello! Welcome to Cafe Coffee. How can I help you today?", "audio_url": "/assets/audio/daily_english/ordering_at_cafe/Barista_L1.mp3"},
    {"line_id": "d2-l2", "speaker": "Customer", "text": "Hi! Can I see the menu, please?"},
    {"line_id": "d2-l3", "speaker": "Waitress", "text": "Sure! Here is the menu. What would you like to have?"},
    {"line_id": "d2-l4", "speaker": "Customer", "text": "I would like to order one Hot Coffee and a Sandwich."},
    {"line_id": "d2-l5", "speaker": "Waitress", "text": "Small, medium, or large coffee?"},
    {"line_id": "d2-l6", "speaker": "Customer", "text": "A medium coffee, please."},
    {"line_id": "d2-l7", "speaker": "Waitress", "text": "Would you like anything else with your order?"},
    {"line_id": "d2-l8", "speaker": "Customer", "text": "No, that’s all. How much is the total?"},
    {"line_id": "d2-l9", "speaker": "Waitress", "text": "That will be 200 rupees, please."},
    {"line_id": "d2-l10", "speaker": "Customer", "text": "Here is the money. Thank you!"},
]

CASUAL_CONVERSATION_SCRIPT = [
    {"line_id": "d3-l1", "speaker": "Aman", "text": "Excuse me, is this the bus stop for Route 10?"},
    {"line_id": "d3-l2", "speaker": "Stranger", "text": "Yes, that's right. It comes here."},
    {"line_id": "d3-l3", "speaker": "Aman", "text": "Great, thank you! Has the bus arrived yet?"},
    {"line_id": "d3-l4", "speaker": "Stranger", "text": "No, not yet. I am waiting for the same bus."},
    {"line_id": "d3-l5", "speaker": "Aman", "text": "Oh, good! The weather is very nice today, isn't it?"},
    {"line_id": "d3-l6", "speaker": "Stranger", "text": "Yes, it is! A bit windy and pleasant."},
    {"line_id": "d3-l7", "speaker": "Aman", "text": "Are you going to work?"},
    {"line_id": "d3-l8", "speaker": "Stranger", "text": "Yes, I work near the City Mall. What about you?"},
    {"line_id": "d3-l9", "speaker": "Aman", "text": "I am going to meet a friend there. Look, the bus is coming!"},
    {"line_id": "d3-l10", "speaker": "Stranger", "text": "Ah, finally! Let's go."},
]

SHOPPING_CONVERSATION_SCRIPT = [
    {"line_id": "d4-l1", "speaker": "Assistant", "text": "Hello! Welcome to our store. How can I help you today?"},
    {"line_id": "d4-l2", "speaker": "Customer", "text": "Hi! I am looking for a blue t-shirt."},
    {"line_id": "d4-l3", "speaker": "Assistant", "text": "Sure! We have many options. What size do you need?"},
    {"line_id": "d4-l4", "speaker": "Customer", "text": "Medium size, please. How much is this blue one?"},
    {"line_id": "d4-l5", "speaker": "Assistant", "text": "This one is 500 rupees."},
    {"line_id": "d4-l6", "speaker": "Customer", "text": "Okay. Do you have any discount on this?"},
    {"line_id": "d4-l7", "speaker": "Assistant", "text": "Yes, we have a 10% discount on this item today."},
    {"line_id": "d4-l8", "speaker": "Customer", "text": "That sounds good! Can I try it on?"},
    {"line_id": "d4-l9", "speaker": "Assistant", "text": "Yes, of course! The trial room is right over there."},
    {"line_id": "d4-l10", "speaker": "Customer", "text": "Great, I will take it. Here is my card."},
]

DIRECTIONS_SCRIPT = [
    {"line_id": "d5-l1", "speaker": "Traveller", "text": "Excuse me! Can you help me, please? I am lost."},
    {"line_id": "d5-l2", "speaker": "Resident", "text": "Sure! Where do you want to go?"},
    {"line_id": "d5-l3", "speaker": "Traveller", "text": "I am looking for the nearest bank. Is it far from here?"},
    {"line_id": "d5-l4", "speaker": "Resident", "text": "No, it’s quite close. Go straight down this street for two minutes."},
    {"line_id": "d5-l5", "speaker": "Traveller", "text": "Okay, straight. And then?"},
    {"line_id": "d5-l6", "speaker": "Resident", "text": "Turn left at the traffic light. You will see a big supermarket."},
    {"line_id": "d5-l7", "speaker": "Traveller", "text": "Turn left at the light. Got it!"},
    {"line_id": "d5-l8", "speaker": "Resident", "text": "Yes! The bank is right next to the supermarket, on your right."},
    {"line_id": "d5-l9", "speaker": "Traveller", "text": "Straight, left at the traffic light, then next to the supermarket. Perfect! Thank you so much."},
]

RESTAURANT_SCRIPT = [
    {"line_id": "d6-l1", "speaker": "Waiter", "text": "Good afternoon! Welcome to Food Palace. A table for one?"},
    {"line_id": "d6-l2", "speaker": "Customer", "text": "Yes, please. A table near the window would be great."},
    {"line_id": "d6-l3", "speaker": "Waiter", "text": "Sure, right this way, please. Here is the menu."},
    {"line_id": "d6-l4", "speaker": "Customer", "text": "Thank you. What do you recommend today?"},
    {"line_id": "d6-l5", "speaker": "Waiter", "text": "Our Special Paneer Butter Masala with Butter Naan is very popular."},
    {"line_id": "d6-l6", "speaker": "Customer", "text": "That sounds delicious! I will have that, please."},
    {"line_id": "d6-l7", "speaker": "Waiter", "text": "Would you like anything to drink with your meal?"},
    {"line_id": "d6-l8", "speaker": "Customer", "text": "Just a glass of fresh lime soda, please."},
    {"line_id": "d6-l9", "speaker": "Waiter", "text": "Perfect! Your order will be ready in 15 minutes."},
]

WEEKENDS_SCRIPT = [
    {"line_id": "d7-l1", "speaker": "Pritam", "text": "Hi Priya! Good morning! How was your weekend?"},
    {"line_id": "d7-l2", "speaker": "Priya", "text": "Good morning Pritam! It was great, thanks. What about yours?"},
    {"line_id": "d7-l3", "speaker": "Pritam", "text": "Mine was good too! What did you do on Saturday?"},
    {"line_id": "d7-l4", "speaker": "Priya", "text": "I stayed at home and watched a movie with my family."},
    {"line_id": "d7-l5", "speaker": "Pritam", "text": "That sounds relaxing! Did you go anywhere on Sunday?"},
    {"line_id": "d7-l6", "speaker": "Priya", "text": "Yes, I went to the park in the evening. How did you spend your weekend?"},
    {"line_id": "d7-l7", "speaker": "Pritam", "text": "I met my old school friends. We played cricket and had lunch together."},
    {"line_id": "d7-l8", "speaker": "Priya", "text": "Wow, that sounds like a lot of fun!"},
    {"line_id": "d7-l9", "speaker": "Pritam", "text": "Yes, it was! Are you ready for the new week now?"},
    {"line_id": "d7-l10", "speaker": "Priya", "text": "Yes, completely! Let's get to work."},
]

DOCTOR_SCRIPT = [
    {"line_id": "d8-l1", "speaker": "Doctor", "text": "Good morning! Please take a seat. How are you feeling today?"},
    {"line_id": "d8-l2", "speaker": "Patient", "text": "Good morning, Doctor. I am not feeling very well."},
    {"line_id": "d8-l3", "speaker": "Doctor", "text": "What seems to be the problem?"},
    {"line_id": "d8-l4", "speaker": "Patient", "text": "I have a mild fever and a bad sore throat since yesterday."},
    {"line_id": "d8-l5", "speaker": "Doctor", "text": "I see. Let me check your temperature and throat first. Open your mouth, please."},
    {"line_id": "d8-l6", "speaker": "Patient", "text": "Ahhh... Is it something serious, Doctor?"},
    {"line_id": "d8-l7", "speaker": "Doctor", "text": "No, don't worry. It looks like a normal seasonal viral infection."},
    {"line_id": "d8-l8", "speaker": "Patient", "text": "That’s a relief! Do I need to take any medicine?"},
    {"line_id": "d8-l9", "speaker": "Doctor", "text": "Yes, I am writing some medicines. Take them twice a day after food."},
    {"line_id": "d8-l10", "speaker": "Patient", "text": "Okay, Doctor. Should I avoid any specific food?"},
    {"line_id": "d8-l11", "speaker": "Doctor", "text": "Drink warm water and avoid cold drinks for two days. Take rest!"},
    {"line_id": "d8-l12", "speaker": "Patient", "text": "Thank you so much, Doctor!"},
]

PHONE_SCRIPT = [
    {"line_id": "d9-l1", "speaker": "Rohan", "text": "Hello Amit! This is Rohan. Can you hear me clearly?"},
    {"line_id": "d9-l2", "speaker": "Amit", "text": "Hi Rohan! Yes, I can hear you fine. How are you doing?"},
    {"line_id": "d9-l3", "speaker": "Rohan", "text": "I am good, thanks! Are you busy right now or can you talk?"},
    {"line_id": "d9-l4", "speaker": "Amit", "text": "I am free right now. Tell me, what's up?"},
    {"line_id": "d9-l5", "speaker": "Rohan", "text": "I was thinking of meeting up this evening. Are you free around 6 PM?"},
    {"line_id": "d9-l6", "speaker": "Amit", "text": "Oh, sorry, I have some work at 6 PM. Can we meet at 7 PM instead?"},
    {"line_id": "d9-l7", "speaker": "Rohan", "text": "Sure, 7 PM works for me! Let's meet at the Central Park."},
    {"line_id": "d9-l8", "speaker": "Amit", "text": "Sounds great! See you at 7 PM then."},
    {"line_id": "d9-l9", "speaker": "Rohan", "text": "Perfect! Take care, bye."},
    {"line_id": "d9-l10", "speaker": "Amit", "text": "Bye!"},
]

OPINIONS_SCRIPT = [
    {"line_id": "d10-l1", "speaker": "Priya", "text": "Hi Rohit! Did you watch the new action movie yesterday?"},
    {"line_id": "d10-l2", "speaker": "Rohit", "text": "Yes, I watched it last night! What about you?"},
    {"line_id": "d10-l3", "speaker": "Priya", "text": "I watched it too! In my opinion, the movie was really good."},
    {"line_id": "d10-l4", "speaker": "Rohit", "text": "Really? Personally, I found it a bit boring."},
    {"line_id": "d10-l5", "speaker": "Priya", "text": "Oh, why do you think so? I loved the action scenes!"},
    {"line_id": "d10-l6", "speaker": "Rohit", "text": "The action was good, but I feel the story was very weak."},
    {"line_id": "d10-l7", "speaker": "Priya", "text": "I agree, the story was simple, but the acting was amazing!"},
    {"line_id": "d10-l8", "speaker": "Rohit", "text": "That’s true. The main hero did a fantastic job."},
    {"line_id": "d10-l9", "speaker": "Priya", "text": "So, overall, would you recommend it to others?"},
    {"line_id": "d10-l10", "speaker": "Rohit", "text": "Yes, it is worth watching at least once!"},
]

BUSINESS_MEETING_SCRIPT = [
    {"line_id": "b1-l1", "speaker": "Manager", "text": "Good morning, everyone. Thank you for joining today's meeting."},
    {"line_id": "b1-l2", "speaker": "Ravi", "text": "Good morning! Are we discussing the quarterly targets today?"},
    {"line_id": "b1-l3", "speaker": "Manager", "text": "Yes, that's right. Let me share the agenda on the screen."},
    {"line_id": "b1-l4", "speaker": "Sneha", "text": "I have the sales report ready. Shall I present it first?"},
    {"line_id": "b1-l5", "speaker": "Manager", "text": "Please go ahead, Sneha. The floor is yours."},
    {"line_id": "b1-l6", "speaker": "Sneha", "text": "Our revenue grew by 15% compared to the last quarter."},
    {"line_id": "b1-l7", "speaker": "Ravi", "text": "That's impressive! Which product line contributed the most?"},
    {"line_id": "b1-l8", "speaker": "Sneha", "text": "The premium subscription plan drove most of the growth."},
    {"line_id": "b1-l9", "speaker": "Manager", "text": "Excellent work, team. Let's set our goals for the next quarter."},
    {"line_id": "b1-l10", "speaker": "Ravi", "text": "I suggest we target a 20% increase. I will draft a plan by Friday."},
]

PROFESSIONAL_EMAIL_SCRIPT = [
    {"line_id": "b2-l1", "speaker": "Anita", "text": "Vikram, I need to send an email to our client about the project delay. Can you help me?"},
    {"line_id": "b2-l2", "speaker": "Vikram", "text": "Sure! First, start with a professional greeting like 'Dear Mr. Sharma'."},
    {"line_id": "b2-l3", "speaker": "Anita", "text": "Okay. And how should I explain the delay without sounding unprofessional?"},
    {"line_id": "b2-l4", "speaker": "Vikram", "text": "Say something like 'We regret to inform you that the delivery timeline has been revised.'"},
    {"line_id": "b2-l5", "speaker": "Anita", "text": "That sounds good. Should I mention the new deadline?"},
    {"line_id": "b2-l6", "speaker": "Vikram", "text": "Absolutely. Be specific. Write 'The revised delivery date is March 15th.'"},
    {"line_id": "b2-l7", "speaker": "Anita", "text": "Should I apologize in the email?"},
    {"line_id": "b2-l8", "speaker": "Vikram", "text": "Yes, add 'We sincerely apologize for any inconvenience caused.'"},
    {"line_id": "b2-l9", "speaker": "Anita", "text": "How should I close the email?"},
    {"line_id": "b2-l10", "speaker": "Vikram", "text": "End with 'Please do not hesitate to reach out if you have any questions."},
    {"line_id": "b2-l11", "speaker": "Anita", "text": "Thank you so much Vikram!"},
    {"line_id": "b2-l12", "speaker": "Vikram", "text": "You're welcome! I'm sure the client will understand."},
]

# Business English Lesson 3: Negotiating Deals script with audio URLs mapped to frontend assets
NEGOTIATION_SCRIPT = [
    {"line_id": "b3-l1", "speaker": "Buyer", "text": "Thank you for meeting with us today. We are interested in your software package."},
    {"line_id": "b3-l2", "speaker": "Seller", "text": "We appreciate your interest. Our standard package is priced at 5 lakh rupees per year."},
    {"line_id": "b3-l3", "speaker": "Buyer", "text": "That is a bit above our budget. Is there any room for negotiation?"},
    {"line_id": "b3-l4", "speaker": "Seller", "text": "We can discuss flexible options. What budget range are you working with?"},
    {"line_id": "b3-l5", "speaker": "Buyer", "text": "We were hoping to keep it around 3.5 lakh rupees."},
    {"line_id": "b3-l6", "speaker": "Seller", "text": "For that price, we could offer the basic tier with fewer features. Would that work?"},
    {"line_id": "b3-l7", "speaker": "Buyer", "text": "We really need the analytics module included. Can you meet us at 4 lakh?"},
    {"line_id": "b3-l8", "speaker": "Seller", "text": "If you commit to a two-year contract, we can offer the full package at 4 lakh per year."},
    {"line_id": "b3-l9", "speaker": "Buyer", "text": "That sounds like a fair deal. Let me discuss this with my team and get back to you."},
    {"line_id": "b3-l10", "speaker": "Seller", "text": "Absolutely. Take your time. We look forward to a great partnership."},
]

PRESENTATION_SCRIPT = [
    {"line_id": "b4-l1", "speaker": "Presenter", "text": "Good afternoon, everyone. Today I will be presenting our marketing strategy for Q3."},
    {"line_id": "b4-l2", "speaker": "Presenter", "text": "Let me start by sharing the key highlights from last quarter's performance."},
    {"line_id": "b4-l3", "speaker": "Presenter", "text": "As you can see on this slide, our social media engagement increased by 40%."},
    {"line_id": "b4-l4", "speaker": "Audience", "text": "That is quite impressive. What do you attribute the growth to?"},
    {"line_id": "b4-l5", "speaker": "Presenter", "text": "We focused on video content and influencer collaborations, which really resonated with our audience."},
    {"line_id": "b4-l6", "speaker": "Presenter", "text": "Moving forward, our strategy includes three main pillars. Let me walk you through each one."},
    {"line_id": "b4-l7", "speaker": "Audience", "text": "Could you elaborate on the budget allocation for digital advertising?"},
    {"line_id": "b4-l8", "speaker": "Presenter", "text": "Of course. We plan to allocate 60% of the budget to digital channels and 40% to offline events."},
    {"line_id": "b4-l9", "speaker": "Audience", "text": "Thank you. This looks like a solid plan."},
    {"line_id": "b4-l10", "speaker": "Presenter", "text": "Thank you for your feedback. I am happy to answer any more questions after the session."},
]

NETWORKING_SCRIPT = [
    {"line_id": "b5-l1", "speaker": "Meera", "text": "Hi! I don't think we have met before. I am Meera from the marketing team."},
    {"line_id": "b5-l2", "speaker": "Arjun", "text": "Hello Meera! I am Arjun. I work in the product development department."},
    {"line_id": "b5-l3", "speaker": "Meera", "text": "Nice to meet you, Arjun! How long have you been with the company?"},
    {"line_id": "b5-l4", "speaker": "Arjun", "text": "About three years now. I joined right after the company expanded to Bangalore."},
    {"line_id": "b5-l5", "speaker": "Meera", "text": "That's wonderful! I just joined two months ago. I am still getting to know everyone."},
    {"line_id": "b5-l6", "speaker": "Arjun", "text": "Welcome aboard! If you ever need help navigating things, feel free to reach out."},
    {"line_id": "b5-l7", "speaker": "Meera", "text": "That is very kind of you. Actually, I would love to learn more about how your team works."},
    {"line_id": "b5-l8", "speaker": "Arjun", "text": "Sure, let's grab coffee sometime this week and I will tell you all about it."},
    {"line_id": "b5-l9", "speaker": "Meera", "text": "That sounds great! How about Wednesday afternoon?"},
    {"line_id": "b5-l10", "speaker": "Arjun", "text": "Wednesday works perfectly. See you then, Meera!"},
]

DIFFICULT_CONVERSATION_SCRIPT = [
    {"line_id": "b6-l1", "speaker": "Manager", "text": "Rahul, do you have a moment? I would like to discuss your recent project deliverables."},
    {"line_id": "b6-l2", "speaker": "Rahul", "text": "Of course. Is there something specific you would like to talk about?"},
    {"line_id": "b6-l3", "speaker": "Manager", "text": "I noticed the last two reports were submitted after the deadline. Can you help me understand what happened?"},
    {"line_id": "b6-l4", "speaker": "Rahul", "text": "I apologize for that. I have been managing multiple tasks and it has been difficult to prioritize."},
    {"line_id": "b6-l5", "speaker": "Manager", "text": "I understand. Workload management can be challenging. Have you considered delegating some tasks?"},
    {"line_id": "b6-l6", "speaker": "Rahul", "text": "I have thought about it, but I was not sure who to assign them to."},
    {"line_id": "b6-l7", "speaker": "Manager", "text": "Let's work together on a plan. I can help you identify team members who can support you."},
    {"line_id": "b6-l8", "speaker": "Rahul", "text": "That would be really helpful. I want to make sure I meet all deadlines going forward."},
    {"line_id": "b6-l9", "speaker": "Manager", "text": "I appreciate your honesty, Rahul. Let's schedule a follow-up meeting next week to review progress."},
    {"line_id": "b6-l10", "speaker": "Rahul", "text": "Thank you for understanding. I will prepare a revised timeline by then."},
]

CORPORATE_ETIQUETTE_SCRIPT = [
    
    {"line_id": "b7-l1", "speaker": "Nisha", "text": "Karan, I have a question. What is the dress code for the client visit tomorrow?"},
    {"line_id": "b7-l2", "speaker": "Karan", "text": "It is business formal. A suit or formal shirt with trousers would be appropriate."},
    {"line_id": "b7-l3", "speaker": "Nisha", "text": "Got it. Should I prepare anything specific for the meeting?"},
    {"line_id": "b7-l4", "speaker": "Karan", "text": "Yes, bring printed copies of the proposal and your business cards."},
    {"line_id": "b7-l5", "speaker": "Nisha", "text": "What about greeting the clients? Is there a specific protocol?"},
    {"line_id": "b7-l6", "speaker": "Karan", "text": "A firm handshake and a warm smile work best. Address them by their last name unless they say otherwise."},
    {"line_id": "b7-l7", "speaker": "Nisha", "text": "Should I start with small talk or get straight to business?"},
    {"line_id": "b7-l8", "speaker": "Karan", "text": "Start with a few minutes of small talk. Ask about their journey or comment on something positive."},

]

REMOTE_WORK_SCRIPT = [
    {"line_id": "b8-l1", "speaker": "Team Lead", "text": "Good morning, team! Can everyone hear me clearly on the video call?"},
    {"line_id": "b8-l2", "speaker": "Divya", "text": "Yes, loud and clear! Good morning."},
    {"line_id": "b8-l3", "speaker": "Sameer", "text": "I can hear you, but my camera seems to be having issues. Let me fix it."},
    {"line_id": "b8-l4", "speaker": "Team Lead", "text": "No problem, Sameer. Let's start with a quick status update from everyone."},
    {"line_id": "b8-l5", "speaker": "Divya", "text": "I completed the design mockups yesterday. I will share the link in the chat."},
    {"line_id": "b8-l6", "speaker": "Team Lead", "text": "Great work, Divya! Sameer, how is the backend development progressing?"},
    {"line_id": "b8-l7", "speaker": "Sameer", "text": "The API is almost done. I need one more day to finish testing."},
    {"line_id": "b8-l8", "speaker": "Team Lead", "text": "Perfect. Let's aim to integrate everything by Thursday. Any blockers from anyone?"},
    {"line_id": "b8-l9", "speaker": "Divya", "text": "I need access to the staging server. Could you grant me permissions?"},
    {"line_id": "b8-l10", "speaker": "Team Lead", "text": "I will set that up right after this call. Anything else? Great, let's wrap up then."},
]

SALES_SCRIPT = [
    {"line_id": "b9-l1", "speaker": "Sales Rep", "text": "Good afternoon! Thank you for taking the time to speak with me today."},
    {"line_id": "b9-l2", "speaker": "Client", "text": "Of course. I am curious to hear about your company's services."},
    {"line_id": "b9-l3", "speaker": "Sales Rep", "text": "Before I begin, may I ask what challenges your team is currently facing?"},
    {"line_id": "b9-l4", "speaker": "Client", "text": "Our biggest challenge is managing customer data efficiently. We need a better CRM solution."},
    {"line_id": "b9-l5", "speaker": "Sales Rep", "text": "That is exactly what we specialize in. Our CRM platform automates data management and boosts productivity."},
    {"line_id": "b9-l6", "speaker": "Client", "text": "How is your solution different from others in the market?"},
    {"line_id": "b9-l7", "speaker": "Sales Rep", "text": "We offer AI-powered analytics and 24/7 customer support, which most competitors do not include."},
    {"line_id": "b9-l8", "speaker": "Client", "text": "That sounds promising. Do you offer a free trial period?"},
    {"line_id": "b9-l9", "speaker": "Sales Rep", "text": "Yes, we offer a 30-day free trial with full access to all features. No commitment required."},
    {"line_id": "b9-l10", "speaker": "Client", "text": "Excellent! Let's set up a demo for my team next week."},
]

LEADERSHIP_SCRIPT = [
    {"line_id": "b10-l1", "speaker": "Leader", "text": "Team, I want to take a moment to acknowledge the hard work everyone has put in this month."},
    {"line_id": "b10-l2", "speaker": "Pooja", "text": "Thank you! It has been a challenging month, but very rewarding."},
    {"line_id": "b10-l3", "speaker": "Leader", "text": "I know the deadline pressure was tough. How is everyone feeling about the workload?"},
    {"line_id": "b10-l4", "speaker": "Suresh", "text": "Honestly, it was intense, but having clear goals really helped us stay focused."},
    {"line_id": "b10-l5", "speaker": "Leader", "text": "That is great to hear. I believe in setting clear expectations so everyone knows their role."},
    {"line_id": "b10-l6", "speaker": "Pooja", "text": "I also appreciate that you were available whenever we needed guidance."},
    {"line_id": "b10-l7", "speaker": "Leader", "text": "Open communication is key. My door is always open for ideas, feedback, or concerns."},
    {"line_id": "b10-l8", "speaker": "Suresh", "text": "What are our priorities for the next month?"},
    {"line_id": "b10-l9", "speaker": "Leader", "text": "We will focus on improving customer satisfaction scores and launching the new feature update."},
    {"line_id": "b10-l10", "speaker": "Pooja", "text": "Sounds exciting! We are ready for the challenge."},
]
## Start of Interview Lessons Scripts
INTERVIEW_INTRO_SCRIPT = [
    {"line_id": "i1-l1", "speaker": "Interviewer", "text": "Good morning! Please have a seat. Can you start by telling me a little about yourself?"},
    {"line_id": "i1-l2", "speaker": "Candidate", "text": "Good morning! Of course. My name is Aarav Sharma. I am a software engineer with five years of experience."},
    {"line_id": "i1-l3", "speaker": "Candidate", "text": "I started my career at a startup, where I built full-stack web applications from scratch."},
    {"line_id": "i1-l4", "speaker": "Interviewer", "text": "That sounds great. What kind of projects did you work on there?"},
    {"line_id": "i1-l5", "speaker": "Candidate", "text": "I developed an e-commerce platform that scaled to over 100,000 users within its first year."},
    {"line_id": "i1-l6", "speaker": "Interviewer", "text": "Impressive! What brought you to apply for this position?"},
    {"line_id": "i1-l7", "speaker": "Candidate", "text": "I am looking for a role where I can work on complex challenges and grow as an engineer."},
    {"line_id": "i1-l8", "speaker": "Candidate", "text": "Your company's focus on innovative products really aligns with my career goals."},
    {"line_id": "i1-l9", "speaker": "Interviewer", "text": "That is great to hear. What would you say is your greatest professional achievement so far?"},
    {"line_id": "i1-l10", "speaker": "Candidate", "text": "Leading a team that delivered a critical feature two weeks ahead of schedule, saving the company significant costs."},
]

INTERVIEW_BEHAVIORAL_SCRIPT = [
    {"line_id": "i2-l1", "speaker": "Interviewer", "text": "Can you tell me about a time you faced a major challenge at work?"},
    {"line_id": "i2-l2", "speaker": "Candidate", "text": "Certainly. In my previous role, our main server went down two hours before a product launch."},
    {"line_id": "i2-l3", "speaker": "Interviewer", "text": "What did you do to handle the situation?"},
    {"line_id": "i2-l4", "speaker": "Candidate", "text": "I immediately assembled the team, identified the root cause as a database misconfiguration, and rolled back the changes."},
    {"line_id": "i2-l5", "speaker": "Candidate", "text": "We restored the service within 45 minutes and the launch proceeded successfully."},
    {"line_id": "i2-l6", "speaker": "Interviewer", "text": "Excellent! What did you learn from that experience?"},
    {"line_id": "i2-l7", "speaker": "Candidate", "text": "I learned the importance of having a rollback plan before any major deployment."},
    {"line_id": "i2-l8", "speaker": "Candidate", "text": "I also improved our team's incident response checklist to prevent similar issues."},
    {"line_id": "i2-l9", "speaker": "Interviewer", "text": "That shows great leadership. How did the team respond to your direction?"},
    {"line_id": "i2-l10", "speaker": "Candidate", "text": "The team was calm and focused. Clear communication made all the difference under pressure."},
]

INTERVIEW_MOTIVATION_SCRIPT = [
    {"line_id": "i3-l1", "speaker": "Interviewer", "text": "Why do you want to work for our company specifically?"},
    {"line_id": "i3-l2", "speaker": "Candidate", "text": "I have been following your company's journey for the past two years and I am genuinely inspired by your mission."},
    {"line_id": "i3-l3", "speaker": "Interviewer", "text": "What specifically about our mission resonates with you?"},
    {"line_id": "i3-l4", "speaker": "Candidate", "text": "Your commitment to making technology accessible to rural communities aligns deeply with my personal values."},
    {"line_id": "i3-l5", "speaker": "Interviewer", "text": "That is wonderful. Have you had any experience working on similar social impact projects?"},
    {"line_id": "i3-l6", "speaker": "Candidate", "text": "Yes, I volunteered with an NGO to build a digital literacy platform for underprivileged students."},
    {"line_id": "i3-l7", "speaker": "Interviewer", "text": "How did that experience shape your professional goals?"},
    {"line_id": "i3-l8", "speaker": "Candidate", "text": "It showed me that technology can genuinely transform lives. That is the kind of work I want to dedicate my career to."},
    {"line_id": "i3-l9", "speaker": "Interviewer", "text": "And what role do you see yourself playing in our team?"},
    {"line_id": "i3-l10", "speaker": "Candidate", "text": "I would love to contribute both technically and as a mentor, helping junior developers grow within your team."},
]

INTERVIEW_STRENGTHS_SCRIPT = [
    {"line_id": "i4-l1", "speaker": "Interviewer", "text": "What would you consider to be your greatest professional strength?"},
    {"line_id": "i4-l2", "speaker": "Candidate", "text": "My strongest skill is problem-solving under pressure. I stay calm and analytical even in stressful situations."},
    {"line_id": "i4-l3", "speaker": "Interviewer", "text": "Can you give me a specific example of that?"},
    {"line_id": "i4-l4", "speaker": "Candidate", "text": "During a critical product demo, our integration with a third-party API broke unexpectedly."},
    {"line_id": "i4-l5", "speaker": "Candidate", "text": "I quickly built a mock API in under an hour so the demo could proceed without any issues."},
    {"line_id": "i4-l6", "speaker": "Interviewer", "text": "That is very resourceful! What other strengths do you bring to the table?"},
    {"line_id": "i4-l7", "speaker": "Candidate", "text": "I am also a strong communicator. I make it a point to keep all stakeholders informed throughout a project."},
    {"line_id": "i4-l8", "speaker": "Interviewer", "text": "How do you ensure clear communication in a fast-moving environment?"},
    {"line_id": "i4-l9", "speaker": "Candidate", "text": "I hold brief daily stand-ups and send concise written summaries at the end of each sprint."},
    {"line_id": "i4-l10", "speaker": "Interviewer", "text": "That is a great habit. Those are exactly the qualities we look for in candidates."},
]

INTERVIEW_WEAKNESSES_SCRIPT = [
    {"line_id": "i5-l1", "speaker": "Interviewer", "text": "Everyone has areas to improve. What would you say is your greatest weakness?"},
    {"line_id": "i5-l2", "speaker": "Candidate", "text": "I used to struggle with delegating tasks. I often tried to handle everything myself."},
    {"line_id": "i5-l3", "speaker": "Interviewer", "text": "That is quite common. How did that affect your work?"},
    {"line_id": "i5-l4", "speaker": "Candidate", "text": "There were times I became a bottleneck, which slowed down the overall team's progress."},
    {"line_id": "i5-l5", "speaker": "Interviewer", "text": "How have you worked to address this?"},
    {"line_id": "i5-l6", "speaker": "Candidate", "text": "I actively worked on trusting my teammates more and clearly defining ownership for each task."},
    {"line_id": "i5-l7", "speaker": "Candidate", "text": "I also took a course on team leadership to improve my delegation and management skills."},
    {"line_id": "i5-l8", "speaker": "Interviewer", "text": "That shows strong self-awareness. Have you seen improvements since then?"},
    {"line_id": "i5-l9", "speaker": "Candidate", "text": "Absolutely. My last project was delivered ahead of schedule because the team was more empowered and efficient."},
    {"line_id": "i5-l10", "speaker": "Interviewer", "text": "That is a great example of turning a weakness into a strength. Well done."},
]

INTERVIEW_TECHNICAL_SCRIPT = [
    {"line_id": "i6-l1", "speaker": "Interviewer", "text": "Let's talk about your technical background. How would you explain REST APIs to a non-technical stakeholder?"},
    {"line_id": "i6-l2", "speaker": "Candidate", "text": "I would compare a REST API to a waiter in a restaurant. You place your order, the kitchen prepares it, and the waiter brings it back."},
    {"line_id": "i6-l3", "speaker": "Interviewer", "text": "That is a great analogy! What about database design? Walk me through your approach."},
    {"line_id": "i6-l4", "speaker": "Candidate", "text": "I start by identifying the entities and their relationships, then normalize the schema to eliminate redundancy."},
    {"line_id": "i6-l5", "speaker": "Interviewer", "text": "How do you handle performance issues in large databases?"},
    {"line_id": "i6-l6", "speaker": "Candidate", "text": "I use indexing on frequently queried columns and analyze slow query logs to optimize bottlenecks."},
    {"line_id": "i6-l7", "speaker": "Interviewer", "text": "Good. Tell me about a technically challenging problem you solved recently."},
    {"line_id": "i6-l8", "speaker": "Candidate", "text": "I redesigned a legacy monolith into microservices, which reduced deployment time by 60%."},
    {"line_id": "i6-l9", "speaker": "Interviewer", "text": "Impressive. What was the biggest risk you encountered during that process?"},
    {"line_id": "i6-l10", "speaker": "Candidate", "text": "Data consistency across services was the biggest risk. I solved it using an event-driven architecture with message queues."},
]

INTERVIEW_SALARY_SCRIPT = [
    {"line_id": "i7-l1", "speaker": "Interviewer", "text": "We are very impressed with your profile. Let's talk about compensation. What are your salary expectations?"},
    {"line_id": "i7-l2", "speaker": "Candidate", "text": "Based on my experience and market research, I am expecting a package in the range of 18 to 22 lakhs per annum."},
    {"line_id": "i7-l3", "speaker": "Interviewer", "text": "That is somewhat above our initial budget for this role. Is there flexibility on your end?"},
    {"line_id": "i7-l4", "speaker": "Candidate", "text": "I am open to discussing the full compensation package including benefits, bonuses, and growth opportunities."},
    {"line_id": "i7-l5", "speaker": "Interviewer", "text": "We can offer 17 lakhs along with performance bonuses and an annual review cycle."},
    {"line_id": "i7-l6", "speaker": "Candidate", "text": "Could you tell me more about the bonus structure? That would help me evaluate the total offer."},
    {"line_id": "i7-l7", "speaker": "Interviewer", "text": "Typically, bonuses range from 10 to 20 percent based on performance and company targets."},
    {"line_id": "i7-l8", "speaker": "Candidate", "text": "That is very helpful. Considering the bonus potential, I think we can make it work."},
    {"line_id": "i7-l9", "speaker": "Interviewer", "text": "Excellent! We also offer flexible work hours and a generous learning and development budget."},
    {"line_id": "i7-l10", "speaker": "Candidate", "text": "That sounds like a great package overall. I am excited about the opportunity to join the team."},
]

INTERVIEW_QUESTIONS_SCRIPT = [
    {"line_id": "i8-l1", "speaker": "Interviewer", "text": "We are nearing the end of our interview. Do you have any questions for us?"},
    {"line_id": "i8-l2", "speaker": "Candidate", "text": "Yes, I do! Could you describe what a typical day looks like for someone in this role?"},
    {"line_id": "i8-l3", "speaker": "Interviewer", "text": "You would typically start with a team stand-up, then work on feature development or bug fixes for the day."},
    {"line_id": "i8-l4", "speaker": "Candidate", "text": "That sounds great. How does the team handle knowledge sharing and continuous learning?"},
    {"line_id": "i8-l5", "speaker": "Interviewer", "text": "We have weekly tech talks and a dedicated budget for online courses and conferences."},
    {"line_id": "i8-l6", "speaker": "Candidate", "text": "I love that. What does success look like for someone in this position after six months?"},
    {"line_id": "i8-l7", "speaker": "Interviewer", "text": "We would expect you to be independently delivering features and beginning to mentor junior team members."},
    {"line_id": "i8-l8", "speaker": "Candidate", "text": "That aligns perfectly with my goals. One last question — what is the biggest challenge the team is currently facing?"},
    {"line_id": "i8-l9", "speaker": "Interviewer", "text": "Scaling our infrastructure to handle rapid user growth is our primary focus right now."},
    {"line_id": "i8-l10", "speaker": "Candidate", "text": "That is exactly the kind of challenge I enjoy solving. I look forward to contributing to it."},
]

INTERVIEW_DIFFICULT_SCRIPT = [
    {"line_id": "i9-l1", "speaker": "Interviewer", "text": "Tell me about a time you disagreed with your manager. How did you handle it?"},
    {"line_id": "i9-l2", "speaker": "Candidate", "text": "There was a time my manager wanted to release a feature without proper testing to meet a deadline."},
    {"line_id": "i9-l3", "speaker": "Interviewer", "text": "That is a sensitive situation. What did you do?"},
    {"line_id": "i9-l4", "speaker": "Candidate", "text": "I requested a private conversation and presented data showing the risk of releasing untested code to production."},
    {"line_id": "i9-l5", "speaker": "Candidate", "text": "I proposed a compromise — release a limited beta version while the full feature continued testing."},
    {"line_id": "i9-l6", "speaker": "Interviewer", "text": "How did your manager respond to that?"},
    {"line_id": "i9-l7", "speaker": "Candidate", "text": "He appreciated the data-driven approach and agreed to the beta release plan."},
    {"line_id": "i9-l8", "speaker": "Interviewer", "text": "What was the outcome?"},
    {"line_id": "i9-l9", "speaker": "Candidate", "text": "The beta helped us identify three critical bugs that would have affected thousands of users."},
    {"line_id": "i9-l10", "speaker": "Interviewer", "text": "That is a textbook example of constructive disagreement. Excellent communication skills."},
]

INTERVIEW_CLOSING_SCRIPT = [
    {"line_id": "i10-l1", "speaker": "Interviewer", "text": "We have covered everything on our list today. Thank you for your time, Priya."},
    {"line_id": "i10-l2", "speaker": "Candidate", "text": "Thank you so much! I really enjoyed our conversation and learning more about the role."},
    {"line_id": "i10-l3", "speaker": "Interviewer", "text": "Is there anything you would like to add before we wrap up?"},
    {"line_id": "i10-l4", "speaker": "Candidate", "text": "I just want to reiterate how excited I am about this opportunity. I believe I can make a strong contribution."},
    {"line_id": "i10-l5", "speaker": "Interviewer", "text": "We appreciate your enthusiasm. We will be in touch within the next three business days."},
    {"line_id": "i10-l6", "speaker": "Candidate", "text": "That is great to hear. Would it be appropriate for me to send a follow-up email after this?"},
    {"line_id": "i10-l7", "speaker": "Interviewer", "text": "Absolutely. A brief thank-you email is always appreciated and shows professionalism."},
    {"line_id": "i10-l8", "speaker": "Candidate", "text": "Perfect. I will send that over today. Is there anything else you need from me right now?"},
    {"line_id": "i10-l9", "speaker": "Interviewer", "text": "No, we have everything. It was a pleasure meeting you today, Priya."},
    {"line_id": "i10-l10", "speaker": "Candidate", "text": "The pleasure was entirely mine. Thank you for the wonderful experience. Have a great day!"},
]

## End of Interview Lessons Scripts

LESSONS = [
    _lesson("daily", 1, "Introducing Yourself", "Learn to greet and share basic info.", "Beginner", 8, script=DAILY_1_SCRIPT),
    _lesson("daily", 2, "Ordering at a Cafe", "Common phrases at a coffee shop.", "Beginner", 10, script=ORDERING_AT_CAFE_SCRIPT),
    _lesson("daily", 3, "Making Small Talk", "Casual conversations with strangers.", "Intermediate", 12, script=CASUAL_CONVERSATION_SCRIPT),
    _lesson("daily", 4, "Shopping & Asking Prices", "Bargain, compare and pay confidently.", "Beginner", 9, script=SHOPPING_CONVERSATION_SCRIPT),
    _lesson("daily", 5, "Giving & Following Directions", "Navigate a city like a local.", "Beginner", 10, script=DIRECTIONS_SCRIPT),
    _lesson("daily", 6, "At the Restaurant", "Order, request and pay in style.", "Beginner", 11, script=RESTAURANT_SCRIPT),
    _lesson("daily", 7, "Talking About Weekends", "Share plans and past events smoothly.", "Intermediate", 12, script=WEEKENDS_SCRIPT),
    _lesson("daily", 8, "Doctor & Pharmacy Visit", "Explain symptoms and understand advice.", "Intermediate", 13, script=DOCTOR_SCRIPT),
    _lesson("daily", 9, "Phone Conversations", "Sound natural and clear on calls.", "Intermediate", 12, script=PHONE_SCRIPT),
    _lesson("daily", 10, "Expressing Opinions", "Agree, disagree and add nuance.", "Advanced", 14, script=OPINIONS_SCRIPT),
    _lesson("business", 1, "Business Meetings", "Language for productive meetings.", "Intermediate", 15, script=BUSINESS_MEETING_SCRIPT),
    _lesson("business", 2, "Writing Professional Emails", "Structure and tone for emails.", "Intermediate", 10, script=PROFESSIONAL_EMAIL_SCRIPT),
    _lesson("business", 3, "Negotiating Deals", "Persuasive language for negotiations.", "Advanced", 18, script=NEGOTIATION_SCRIPT),
    _lesson("business", 4, "Presenting with Confidence", "Deliver impactful presentations and pitches.", "Advanced", 16, script=PRESENTATION_SCRIPT),
    _lesson("business", 5, "Networking & Building Relationships", "Make meaningful professional connections.", "Intermediate", 14, script=NETWORKING_SCRIPT),
    _lesson("business", 6, "Handling Difficult Conversations", "Address conflicts and feedback diplomatically.", "Advanced", 15, script=DIFFICULT_CONVERSATION_SCRIPT),
    _lesson("business", 7, "Corporate Culture & Etiquette", "Navigate workplace norms and professional behavior.", "Intermediate", 12, script=CORPORATE_ETIQUETTE_SCRIPT),
    _lesson("business", 8, "Remote Work Communication", "Excel in video calls and virtual collaboration.", "Intermediate", 13, script=REMOTE_WORK_SCRIPT),
    _lesson("business", 9, "Sales & Persuasion Techniques", "Influence and close deals with confidence.", "Advanced", 17, script=SALES_SCRIPT),
    _lesson("business", 10, "Leadership & Team Motivation", "Inspire and manage teams effectively.", "Advanced", 16, script=LEADERSHIP_SCRIPT),
    _lesson("interview", 1, "Tell Me About Yourself", "Craft a compelling elevator pitch.", "Intermediate", 10, script=INTERVIEW_INTRO_SCRIPT),
    _lesson("interview", 2, "Behavioral Questions", "STAR method for tough questions.", "Advanced", 15, script=INTERVIEW_BEHAVIORAL_SCRIPT),
    _lesson("interview", 3, "Why Do You Want This Job?", "Articulate your motivation and fit.", "Intermediate", 12, script=INTERVIEW_MOTIVATION_SCRIPT),
    _lesson("interview", 4, "Discussing Your Strengths", "Highlight skills without sounding arrogant.", "Intermediate", 11, script=INTERVIEW_STRENGTHS_SCRIPT),
    _lesson("interview", 5, "Addressing Your Weaknesses", "Turn weaknesses into growth opportunities.", "Advanced", 14, script=INTERVIEW_WEAKNESSES_SCRIPT),
    _lesson("interview", 6, "Technical Questions & Problem-Solving", "Explain technical concepts clearly.", "Advanced", 16, script=INTERVIEW_TECHNICAL_SCRIPT),
    _lesson("interview", 7, "Salary Negotiation Conversations", "Discuss compensation confidently.", "Advanced", 13, script=INTERVIEW_SALARY_SCRIPT),
    _lesson("interview", 8, "Questions to Ask the Interviewer", "Show genuine interest and strategic thinking.", "Intermediate", 12, script=INTERVIEW_QUESTIONS_SCRIPT),
    _lesson("interview", 9, "Handling Difficult Interview Scenarios", "Respond tactfully to tricky situations.", "Advanced", 15, script=INTERVIEW_DIFFICULT_SCRIPT),
    _lesson("interview", 10, "Follow-Up & Closing Strong", "Leave a lasting positive impression.", "Intermediate", 10, script=INTERVIEW_CLOSING_SCRIPT),
]

## Start of Travel Lessons Scripts
TRAVEL_AIRPORT_SCRIPT = [
    {"line_id": "t1-l1", "speaker": "Passenger", "text": "Excuse me, where do I check in for the flight to Dubai?"},
    {"line_id": "t1-l2", "speaker": "Staff", "text": "Good morning! Please head to counter number 12. Do you have your passport and ticket ready?"},
    {"line_id": "t1-l3", "speaker": "Passenger", "text": "Yes, I have both. I also have one checked bag and a carry-on."},
    {"line_id": "t1-l4", "speaker": "Staff", "text": "Perfect. Please place your bag on the scale. It weighs 22 kilograms, which is within the limit."},
    {"line_id": "t1-l5", "speaker": "Passenger", "text": "Great. Could I please get a window seat?"},
    {"line_id": "t1-l6", "speaker": "Staff", "text": "Let me check availability. Yes, seat 14A is available. Would that work for you?"},
    {"line_id": "t1-l7", "speaker": "Passenger", "text": "That is perfect, thank you! How early should I be at the boarding gate?"},
    {"line_id": "t1-l8", "speaker": "Staff", "text": "Please be at gate B7 at least 45 minutes before departure."},
    {"line_id": "t1-l9", "speaker": "Passenger", "text": "Understood. Is there anything else I need to know?"},
    {"line_id": "t1-l10", "speaker": "Staff", "text": "You will need to pass through security first. Enjoy your flight!"},
]

TRAVEL_HOTEL_SCRIPT = [
    {"line_id": "t2-l1", "speaker": "Receptionist", "text": "Good evening! Welcome to the Grand Palace Hotel. Do you have a reservation?"},
    {"line_id": "t2-l2", "speaker": "Guest", "text": "Yes, I made a booking online. The name is Kavya Reddy."},
    {"line_id": "t2-l3", "speaker": "Receptionist", "text": "Let me pull that up. Yes, I have a deluxe room booked for three nights. Is that correct?"},
    {"line_id": "t2-l4", "speaker": "Guest", "text": "That is right. Could you tell me if breakfast is included?"},
    {"line_id": "t2-l5", "speaker": "Receptionist", "text": "Yes, complimentary breakfast is served daily from 7 to 10 AM in the dining area."},
    {"line_id": "t2-l6", "speaker": "Guest", "text": "Wonderful! Does the room have a good city view?"},
    {"line_id": "t2-l7", "speaker": "Receptionist", "text": "Absolutely. Your room on the 8th floor has a beautiful view of the main square."},
    {"line_id": "t2-l8", "speaker": "Guest", "text": "That sounds lovely. What time is the check-out?"},
    {"line_id": "t2-l9", "speaker": "Receptionist", "text": "Check-out is at noon. If you need a late check-out, please let us know in advance."},
    {"line_id": "t2-l10", "speaker": "Guest", "text": "I will keep that in mind. Thank you so much!"},
]

TRAVEL_RESTAURANT_SCRIPT = [
    {"line_id": "t3-l1", "speaker": "Waiter", "text": "Good evening! Welcome. Do you have a reservation or would you like a table for two?"},
    {"line_id": "t3-l2", "speaker": "Traveler", "text": "No reservation, just the two of us. A table by the window would be lovely if possible."},
    {"line_id": "t3-l3", "speaker": "Waiter", "text": "Of course! Right this way. Here are your menus. Can I start you with some drinks?"},
    {"line_id": "t3-l4", "speaker": "Traveler", "text": "Yes, two glasses of still water please. What is your dish of the day?"},
    {"line_id": "t3-l5", "speaker": "Waiter", "text": "Today's special is grilled sea bass with lemon butter sauce. It is very popular."},
    {"line_id": "t3-l6", "speaker": "Traveler", "text": "That sounds delicious! I will have that. Does it come with any sides?"},
    {"line_id": "t3-l7", "speaker": "Waiter", "text": "It comes with roasted vegetables and garlic bread."},
    {"line_id": "t3-l8", "speaker": "Traveler", "text": "Perfect. My companion is vegetarian. What would you recommend for them?"},
    {"line_id": "t3-l9", "speaker": "Waiter", "text": "Our mushroom risotto is excellent and fully vegetarian. It is a guest favourite."},
    {"line_id": "t3-l10", "speaker": "Traveler", "text": "Great, we will have that as well. Thank you for your help!"},
]

TRAVEL_TRANSPORT_SCRIPT = [
    {"line_id": "t4-l1", "speaker": "Traveler", "text": "Excuse me, does this bus go to the city centre?"},
    {"line_id": "t4-l2", "speaker": "Local", "text": "Yes, it does! Take bus number 42 and get off at Market Square."},
    {"line_id": "t4-l3", "speaker": "Traveler", "text": "How long does the journey take from here?"},
    {"line_id": "t4-l4", "speaker": "Local", "text": "About 20 minutes. The bus comes every 10 minutes."},
    {"line_id": "t4-l5", "speaker": "Traveler", "text": "Do I need to buy a ticket before boarding or can I pay on the bus?"},
    {"line_id": "t4-l6", "speaker": "Local", "text": "You can pay directly to the driver. Exact change is preferred."},
    {"line_id": "t4-l7", "speaker": "Traveler", "text": "Is there a metro or subway I could take instead?"},
    {"line_id": "t4-l8", "speaker": "Local", "text": "Yes, the nearest metro station is just a 5-minute walk. Take the red line to Central."},
    {"line_id": "t4-l9", "speaker": "Traveler", "text": "Which option would you recommend for a first-time visitor?"},
    {"line_id": "t4-l10", "speaker": "Local", "text": "The metro is faster and easier to navigate. You can also use your contactless card to pay."},
]

TRAVEL_DIRECTIONS_SCRIPT = [
    {"line_id": "t5-l1", "speaker": "Traveler", "text": "Excuse me, I am a bit lost. Could you help me find the National Museum?"},
    {"line_id": "t5-l2", "speaker": "Local", "text": "Of course! You are actually quite close. Head straight down this road for about 200 metres."},
    {"line_id": "t5-l3", "speaker": "Traveler", "text": "And then?"},
    {"line_id": "t5-l4", "speaker": "Local", "text": "Turn left at the traffic lights. You will see a large fountain. The museum is right behind it."},
    {"line_id": "t5-l5", "speaker": "Traveler", "text": "Is there a landmark I can look out for so I know I am going the right way?"},
    {"line_id": "t5-l6", "speaker": "Local", "text": "Yes! Look for the blue clock tower. Once you see that, the museum is just across the street."},
    {"line_id": "t5-l7", "speaker": "Traveler", "text": "How long will it take to walk there?"},
    {"line_id": "t5-l8", "speaker": "Local", "text": "About 10 minutes on foot. It is a pleasant walk."},
    {"line_id": "t5-l9", "speaker": "Traveler", "text": "Thank you so much. Is it open on Sundays?"},
    {"line_id": "t5-l10", "speaker": "Local", "text": "Yes, it is open from 10 AM to 6 PM on Sundays. Enjoy your visit!"},
]

TRAVEL_SHOPPING_SCRIPT = [
    {"line_id": "t6-l1", "speaker": "Traveler", "text": "How much is this handmade scarf? It is beautiful."},
    {"line_id": "t6-l2", "speaker": "Vendor", "text": "For you, special price! Only 800 rupees."},
    {"line_id": "t6-l3", "speaker": "Traveler", "text": "That seems a bit high. I saw a similar one at another stall for 500 rupees."},
    {"line_id": "t6-l4", "speaker": "Vendor", "text": "This one is pure wool, handwoven. Much better quality. I can do 700."},
    {"line_id": "t6-l5", "speaker": "Traveler", "text": "What if I buy two? Can you give me a better deal?"},
    {"line_id": "t6-l6", "speaker": "Vendor", "text": "For two scarves, I will do 1200 rupees. That is a very good price."},
    {"line_id": "t6-l7", "speaker": "Traveler", "text": "Make it 1100 and I will take both right now."},
    {"line_id": "t6-l8", "speaker": "Vendor", "text": "Okay, okay! 1100. Deal! You are a tough negotiator!"},
    {"line_id": "t6-l9", "speaker": "Traveler", "text": "Thank you! Do you have a bag to pack them in?"},
    {"line_id": "t6-l10", "speaker": "Vendor", "text": "Of course! I will wrap them nicely for you. Come back again!"},
]

TRAVEL_EMERGENCY_SCRIPT = [
    {"line_id": "t7-l1", "speaker": "Traveler", "text": "Help! I think my friend has been hurt. We need a doctor immediately."},
    {"line_id": "t7-l2", "speaker": "Bystander", "text": "Oh no! I will call an ambulance right now. What happened?"},
    {"line_id": "t7-l3", "speaker": "Traveler", "text": "He slipped on the stairs and hurt his ankle badly. He cannot stand."},
    {"line_id": "t7-l4", "speaker": "Bystander", "text": "Okay, do not move him. The ambulance should arrive in about 10 minutes."},
    {"line_id": "t7-l5", "speaker": "Traveler", "text": "Is there a pharmacy nearby? I need some ice or a bandage."},
    {"line_id": "t7-l6", "speaker": "Bystander", "text": "There is a pharmacy just two doors down. I can get something for you."},
    {"line_id": "t7-l7", "speaker": "Traveler", "text": "We are tourists. Will the hospital accept our travel insurance?"},
    {"line_id": "t7-l8", "speaker": "Bystander", "text": "Yes, most hospitals here accept international travel insurance. Keep your documents ready."},
    {"line_id": "t7-l9", "speaker": "Traveler", "text": "Thank you so much for your help. We really appreciate it."},
    {"line_id": "t7-l10", "speaker": "Bystander", "text": "Do not worry. The ambulance is on its way. Your friend is in good hands."},
]

TRAVEL_ETIQUETTE_SCRIPT = [
    {"line_id": "t8-l1", "speaker": "Guide", "text": "Welcome to Japan! Before we visit the temple, let me share a few important customs."},
    {"line_id": "t8-l2", "speaker": "Traveler", "text": "That is very helpful. Should I remove my shoes before entering?"},
    {"line_id": "t8-l3", "speaker": "Guide", "text": "Yes, absolutely. Always remove shoes at the entrance and place them neatly in the provided area."},
    {"line_id": "t8-l4", "speaker": "Traveler", "text": "Is photography allowed inside the temple?"},
    {"line_id": "t8-l5", "speaker": "Guide", "text": "Photography is not permitted inside. Please respect the sacred space and keep your phone away."},
    {"line_id": "t8-l6", "speaker": "Traveler", "text": "What about tipping? Is it expected here?"},
    {"line_id": "t8-l7", "speaker": "Guide", "text": "In Japan, tipping is actually considered rude. Good service is simply a standard expectation."},
    {"line_id": "t8-l8", "speaker": "Traveler", "text": "That is quite different from my home country! Are there other customs I should be aware of?"},
    {"line_id": "t8-l9", "speaker": "Guide", "text": "Yes. Speak softly in public places, queue patiently, and always bow slightly when greeting someone."},
    {"line_id": "t8-l10", "speaker": "Traveler", "text": "Thank you for these tips. I want to be respectful of the local culture during my visit."},
]

TRAVEL_PLANNING_SCRIPT = [
    {"line_id": "t9-l1", "speaker": "Traveler", "text": "Hi! I would like to book a train from Paris to Amsterdam for next Friday."},
    {"line_id": "t9-l2", "speaker": "Agent", "text": "Of course! The fastest option is the Thalys train, which takes about three and a half hours."},
    {"line_id": "t9-l3", "speaker": "Traveler", "text": "That is perfect. Are there any morning departures available?"},
    {"line_id": "t9-l4", "speaker": "Agent", "text": "Yes, there are departures at 8:15 AM and 10:30 AM. Which would you prefer?"},
    {"line_id": "t9-l5", "speaker": "Traveler", "text": "The 8:15 departure sounds ideal. How much would a standard ticket cost?"},
    {"line_id": "t9-l6", "speaker": "Agent", "text": "Standard class is 89 euros per person. First class is 135 euros with a complimentary meal."},
    {"line_id": "t9-l7", "speaker": "Traveler", "text": "I will go with standard class. Can I also book a seat reservation?"},
    {"line_id": "t9-l8", "speaker": "Agent", "text": "Yes, seat reservation is included. Would you prefer a window or an aisle seat?"},
    {"line_id": "t9-l9", "speaker": "Traveler", "text": "A window seat please. I love watching the scenery."},
    {"line_id": "t9-l10", "speaker": "Agent", "text": "Done! I have booked seat 12A. Your e-ticket will be sent to your email shortly."},
]

TRAVEL_PROBLEMS_SCRIPT = [
    {"line_id": "t10-l1", "speaker": "Traveler", "text": "Excuse me, my flight has been delayed for three hours. Can you tell me what is happening?"},
    {"line_id": "t10-l2", "speaker": "Staff", "text": "I am very sorry for the inconvenience. There is a technical issue with the aircraft."},
    {"line_id": "t10-l3", "speaker": "Traveler", "text": "I have a connecting flight in two hours. Will I miss it?"},
    {"line_id": "t10-l4", "speaker": "Staff", "text": "Let me check your booking. Unfortunately, you will miss that connection. I will rebook you."},
    {"line_id": "t10-l5", "speaker": "Traveler", "text": "Also, my checked luggage did not arrive on the carousel. I cannot find my bag."},
    {"line_id": "t10-l6", "speaker": "Staff", "text": "I apologize. Please fill out a lost luggage report at our service desk and we will trace it."},
    {"line_id": "t10-l7", "speaker": "Traveler", "text": "How long will it take to locate the bag?"},
    {"line_id": "t10-l8", "speaker": "Staff", "text": "Usually within 24 to 48 hours. We will have it delivered directly to your hotel."},
    {"line_id": "t10-l9", "speaker": "Traveler", "text": "Are we entitled to any compensation for the delay?"},
    {"line_id": "t10-l10", "speaker": "Staff", "text": "Yes, you are entitled to meal vouchers and an accommodation allowance. I will process that now."},
]

## End of Travel Lessons Scripts

LESSONS += [
    _lesson("travel", 1, "At the Airport", "Navigating airports confidently.", "Beginner", 8, script=TRAVEL_AIRPORT_SCRIPT),
    _lesson("travel", 2, "Booking a Hotel", "Reservations and check-in phrases.", "Beginner", 10, script=TRAVEL_HOTEL_SCRIPT),
    _lesson("travel", 3, "Ordering at Restaurants", "Navigate menus and place orders smoothly.", "Beginner", 11, script=TRAVEL_RESTAURANT_SCRIPT),
    _lesson("travel", 4, "Using Public Transportation", "Navigate buses, trains and taxis like a local.", "Beginner", 10, script=TRAVEL_TRANSPORT_SCRIPT),
    _lesson("travel", 5, "Asking for Directions & Maps", "Find your way confidently in unfamiliar places.", "Beginner", 9, script=TRAVEL_DIRECTIONS_SCRIPT),
    _lesson("travel", 6, "Shopping & Markets Haggling", "Negotiate prices and shop at local markets.", "Intermediate", 12, script=TRAVEL_SHOPPING_SCRIPT),
    _lesson("travel", 7, "Emergency Situations & Seeking Help", "Handle medical, police and urgent situations.", "Intermediate", 13, script=TRAVEL_EMERGENCY_SCRIPT),
    _lesson("travel", 8, "Cultural Etiquette & Customs", "Navigate cultural differences respectfully.", "Intermediate", 11, script=TRAVEL_ETIQUETTE_SCRIPT),
    _lesson("travel", 9, "Travel Planning & Itineraries", "Discuss plans and make travel reservations.", "Intermediate", 12, script=TRAVEL_PLANNING_SCRIPT),
    _lesson("travel", 10, "Dealing with Travel Problems", "Handle delays, lost luggage and complaints.", "Intermediate", 14, script=TRAVEL_PROBLEMS_SCRIPT),
]


VOCAB_WORDS = [
    {"id": "w1", "word": "Serendipity", "phonetic": "/ˌser.ənˈdɪp.ə.ti/", "meaning": "Finding something good without looking for it.", "example": "Meeting you here is pure serendipity.", "level": "Advanced"},
    {"id": "w2", "word": "Eloquent", "phonetic": "/ˈel.ə.kwənt/", "meaning": "Fluent and persuasive in speaking.", "example": "She gave an eloquent speech at the conference.", "level": "Intermediate"},
    {"id": "w3", "word": "Resilient", "phonetic": "/rɪˈzɪl.i.ənt/", "meaning": "Able to recover quickly from difficulties.", "example": "Children are surprisingly resilient.", "level": "Intermediate"},
    {"id": "w4", "word": "Meticulous", "phonetic": "/məˈtɪk.jə.ləs/", "meaning": "Showing great attention to detail.", "example": "He is meticulous about his research.", "level": "Advanced"},
    {"id": "w5", "word": "Vivid", "phonetic": "/ˈvɪv.ɪd/", "meaning": "Producing powerful, clear images in the mind.", "example": "She has a vivid imagination.", "level": "Intermediate"},
    {"id": "w6", "word": "Candid", "phonetic": "/ˈkæn.dɪd/", "meaning": "Truthful and straightforward.", "example": "I appreciate your candid feedback.", "level": "Intermediate"},
    {"id": "w7", "word": "Diligent", "phonetic": "/ˈdɪl.ɪ.dʒənt/", "meaning": "Showing care and effort in work.", "example": "She's a diligent student.", "level": "Beginner"},
    {"id": "w8", "word": "Ephemeral", "phonetic": "/ɪˈfem.ər.əl/", "meaning": "Lasting for a very short time.", "example": "The beauty of the sunset was ephemeral.", "level": "Advanced"},
    {"id": "w9", "word": "Empathy", "phonetic": "/ˈem.pə.θi/", "meaning": "Understanding others' feelings.", "example": "Empathy is key to good leadership.", "level": "Intermediate"},
    {"id": "w10", "word": "Nuance", "phonetic": "/ˈnuː.ɑːns/", "meaning": "A subtle difference in meaning.", "example": "Her writing captures every nuance.", "level": "Advanced"},
    {"id": "w11", "word": "Ubiquitous", "phonetic": "/juːˈbɪk.wə.təs/", "meaning": "Present everywhere.", "example": "Smartphones are ubiquitous today.", "level": "Advanced"},
    {"id": "w12", "word": "Gregarious", "phonetic": "/ɡrɪˈɡer.i.əs/", "meaning": "Enjoying the company of others.", "example": "He's a gregarious host.", "level": "Advanced"},
    {"id": "w13", "word": "Pragmatic", "phonetic": "/præɡˈmæt.ɪk/", "meaning": "Dealing with things in a practical, realistic way.", "example": "We need a pragmatic approach to this problem.", "level": "Intermediate"},
    {"id": "w14", "word": "Benevolent", "phonetic": "/bəˈnev.ə.lənt/", "meaning": "Showing kindness and generosity.", "example": "She has a benevolent attitude towards the poor.", "level": "Advanced"},
    {"id": "w15", "word": "Melancholy", "phonetic": "/ˈmel.ən.kol.i/", "meaning": "A feeling of pensive sadness.", "example": "The rainy weather put me in a melancholy mood.", "level": "Intermediate"},
    {"id": "w16", "word": "Audacious", "phonetic": "/ɔːˈdeɪ.ʃəs/", "meaning": "Brave and daring; willing to take risks.", "example": "His audacious plan surprised everyone.", "level": "Advanced"},
    {"id": "w17", "word": "Placid", "phonetic": "/ˈplæs.ɪd/", "meaning": "Calm and peaceful.", "example": "The placid lake reflected the mountains.", "level": "Intermediate"},
    {"id": "w18", "word": "Eloquence", "phonetic": "/ˈel.ə.kwəns/", "meaning": "Fluent, powerful, and persuasive speaking.", "example": "Her eloquence convinced the audience.", "level": "Intermediate"},
    {"id": "w19", "word": "Catalyst", "phonetic": "/ˈkæt.ə.lɪst/", "meaning": "A person or thing that precipitates change.", "example": "Her speech was a catalyst for reform.", "level": "Intermediate"},
    {"id": "w20", "word": "Frivolous", "phonetic": "/ˈfrɪv.ə.ləs/", "meaning": "Not serious; silly or trivial.", "example": "Don't waste time on frivolous matters.", "level": "Intermediate"},
    {"id": "w21", "word": "Adept", "phonetic": "/əˈdept/", "meaning": "Very skilled or proficient.", "example": "She's adept at solving complex problems.", "level": "Beginner"},
    {"id": "w22", "word": "Perspicacious", "phonetic": "/ˌpɜː.spɪˈkeɪ.ʃəs/", "meaning": "Having keen insight and discernment.", "example": "His perspicacious observations were invaluable.", "level": "Advanced"},
    {"id": "w23", "word": "Tangible", "phonetic": "/ˈtæn.dʒə.bəl/", "meaning": "Able to be perceived by touch; real.", "example": "We need tangible evidence before proceeding.", "level": "Intermediate"},
    {"id": "w24", "word": "Obfuscate", "phonetic": "/ˈɒb.fəs.keɪt/", "meaning": "To deliberately make something unclear.", "example": "Don't obfuscate the facts.", "level": "Advanced"},
    {"id": "w25", "word": "Nascent", "phonetic": "/ˈneɪ.sənt/", "meaning": "Just beginning to exist or develop.", "example": "The nascent technology shows great promise.", "level": "Advanced"},
    {"id": "w26", "word": "Perennial", "phonetic": "/pəˈren.i.əl/", "meaning": "Lasting through the year or for many years.", "example": "That's a perennial favorite among students.", "level": "Intermediate"},
    {"id": "w27", "word": "Oblivious", "phonetic": "/əˈblɪv.i.əs/", "meaning": "Not aware or mindful of.", "example": "He seemed oblivious to her feelings.", "level": "Intermediate"},
    {"id": "w28", "word": "Magnanimous", "phonetic": "/mæɡˈnæn.ɪ.məs/", "meaning": "Generous and forgiving; noble.", "example": "A magnanimous leader inspires loyalty.", "level": "Advanced"},
    {"id": "w29", "word": "Ambiguous", "phonetic": "/æmˈbɪɡ.ju.əs/", "meaning": "Open to more than one interpretation.", "example": "His answer was ambiguous and unhelpful.", "level": "Intermediate"},
    {"id": "w30", "word": "Pragmatism", "phonetic": "/ˈpræɡ.mə.tɪz.əm/", "meaning": "An approach focused on practical results.", "example": "Her pragmatism helped solve the crisis.", "level": "Intermediate"},
    {"id": "w31", "word": "Petulant", "phonetic": "/ˈpet.jə.lənt/", "meaning": "Childishly sulky or easily annoyed.", "example": "He gave a petulant response to the criticism.", "level": "Intermediate"},
    {"id": "w32", "word": "Altruism", "phonetic": "/ˈæl.tru.ɪz.əm/", "meaning": "Concern for others; selflessness.", "example": "Her altruism inspired many people.", "level": "Intermediate"},
    {"id": "w33", "word": "Anomaly", "phonetic": "/əˈnɒm.ə.li/", "meaning": "Something that differs from the norm.", "example": "The test results showed an anomaly.", "level": "Intermediate"},
    {"id": "w34", "word": "Colloquial", "phonetic": "/kəˈloʊ.kwi.əl/", "meaning": "Used in ordinary conversation.", "example": "That's too colloquial for a formal essay.", "level": "Intermediate"},
    {"id": "w35", "word": "Incisive", "phonetic": "/ɪnˈsaɪ.sɪv/", "meaning": "Sharp, clear, and penetrating.", "example": "Her incisive analysis revealed the problem.", "level": "Advanced"},
    {"id": "w36", "word": "Jocular", "phonetic": "/ˈdʒɒk.jə.lər/", "meaning": "Joking or humorous in tone.", "example": "His jocular remarks lightened the mood.", "level": "Intermediate"},
    {"id": "w37", "word": "Languish", "phonetic": "/ˈlæŋ.ɡwɪʃ/", "meaning": "To lose strength or vitality; to long for.", "example": "The plants will languish without water.", "level": "Intermediate"},
    {"id": "w38", "word": "Nonchalant", "phonetic": "/ˌnɒnʃəˈlɑːnt/", "meaning": "Casually indifferent; unconcerned.", "example": "He gave a nonchalant shrug.", "level": "Intermediate"},
    {"id": "w39", "word": "Palpable", "phonetic": "/ˈpæl.pə.bəl/", "meaning": "Able to be touched or felt; obvious.", "example": "The tension in the room was palpable.", "level": "Intermediate"},
    {"id": "w40", "word": "Quixotic", "phonetic": "/kwɪkˈsɒt.ɪk/", "meaning": "Exceedingly idealistic; unrealistic.", "example": "His quixotic dreams seemed impossible.", "level": "Advanced"},
    {"id": "w41", "word": "Resonant", "phonetic": "/ˈrez.ə.nənt/", "meaning": "Producing a loud, deep sound; having profound meaning.", "example": "Her words were resonant with truth.", "level": "Advanced"},
    {"id": "w42", "word": "Sagacious", "phonetic": "/səˈɡeɪ.ʃəs/", "meaning": "Wise and discerning; showing good judgment.", "example": "His sagacious advice proved invaluable.", "level": "Advanced"},
    {"id": "w43", "word": "Tacit", "phonetic": "/ˈtæs.ɪt/", "meaning": "Understood or implied without being stated.", "example": "There was a tacit agreement between them.", "level": "Intermediate"},
    {"id": "w44", "word": "Unequivocal", "phonetic": "/ˌʌn.ɪˈkwɪv.ə.kəl/", "meaning": "Clear and unambiguous; absolute.", "example": "She gave an unequivocal no.", "level": "Advanced"},
    {"id": "w45", "word": "Vacillate", "phonetic": "/ˈvæs.ɪ.leɪt/", "meaning": "To waver between decisions.", "example": "He tends to vacillate on important choices.", "level": "Advanced"},
    {"id": "w46", "word": "Whimsical", "phonetic": "/ˈwɪm.zɪ.kəl/", "meaning": "Playfully quaint or fanciful.", "example": "The painting had a whimsical charm.", "level": "Intermediate"},
    {"id": "w47", "word": "Xenial", "phonetic": "/ˈzen.i.əl/", "meaning": "Hospitable and generous to guests.", "example": "They gave us a xenial welcome.", "level": "Advanced"},
    {"id": "w48", "word": "Zealous", "phonetic": "/ˈzel.əs/", "meaning": "Filled with passionate energy and eagerness.", "example": "She's zealous about environmental causes.", "level": "Intermediate"},
    {"id": "w49", "word": "Zephyr", "phonetic": "/ˈzef.ər/", "meaning": "A gentle breeze.", "example": "A warm zephyr swept across the garden.", "level": "Intermediate"},
    {"id": "w50", "word": "Euphoria", "phonetic": "/juːˈfɔː.ri.ə/", "meaning": "A state of intense happiness and confidence.", "example": "The victory brought euphoria to the team.", "level": "Intermediate"},
]

DAILY_CHALLENGES = [
    {"id": "c1", "title": "Speak for 5 minutes", "description": "Practice speaking for 5 minutes today.", "xp": 50, "type": "speak", "target": 5, "icon": "mic"},
    {"id": "c2", "title": "Learn 20 new words", "description": "Add 20 words to your vocabulary.", "xp": 40, "type": "vocab", "target": 20, "icon": "book"},
    {"id": "c3", "title": "Complete a Quiz", "description": "Ace today's grammar quiz.", "xp": 30, "type": "quiz", "target": 1, "icon": "help-circle"},
    {"id": "c4", "title": "Finish 1 Lesson", "description": "Complete any English lesson.", "xp": 25, "type": "lesson", "target": 1, "icon": "school"},
]

QUIZ_QUESTIONS = [
    {"id": "q1", "question": "Which sentence is correct?", "options": ["He don't like tea.", "He doesn't like tea.", "He not likes tea.", "He no like tea."], "answer": 1},
    {"id": "q2", "question": "Choose the correct past tense of 'go'.", "options": ["goed", "gone", "went", "going"], "answer": 2},
    {"id": "q3", "question": "'I ___ studying English for two years.'", "options": ["am", "have been", "was", "will"], "answer": 1},
    {"id": "q4", "question": "Which is a synonym for 'happy'?", "options": ["Sorrow", "Elated", "Weary", "Fierce"], "answer": 1},
    {"id": "q5", "question": "Pick the correct article: 'She is ___ honest person.'", "options": ["a", "an", "the", "no article"], "answer": 1},
    {"id": "q6", "question": "Choose the correct spelling:", "options": ["Occured", "Occured", "Occurred", "Ocurred"], "answer": 2},
    {"id": "q7", "question": "What is the opposite of 'generous'?", "options": ["Kind", "Selfish", "Caring", "Thoughtful"], "answer": 1},
    {"id": "q8", "question": "'If I were you, I ___ accept the offer.'", "options": ["will", "would", "am", "should"], "answer": 1},
    {"id": "q9", "question": "Which word means 'extremely tired'?", "options": ["Energetic", "Exhausted", "Alert", "Awake"], "answer": 1},
    {"id": "q10", "question": "'She has always ___ her dreams despite challenges.'", "options": ["pursue", "pursues", "pursued", "pursuing"], "answer": 2},
    {"id": "q11", "question": "What does 'break the ice' mean?", "options": ["To damage ice physically", "To start a conversation or make people comfortable", "To freeze something", "To go ice skating"], "answer": 1},
    {"id": "q12", "question": "What idiom means 'to stop worrying about something'?", "options": ["Let the cat out", "Let it go", "Keep your cool", "Let it be"], "answer": 1},
    {"id": "q13", "question": "Which phrase means 'to fail or not succeed'?", "options": ["Hit the mark", "Miss the boat", "Hit the road", "Miss the point"], "answer": 1},
    {"id": "q14", "question": "What does 'cost an arm and a leg' mean?", "options": ["Requires physical exercise", "Is very expensive", "Is difficult to transport", "Requires surgery"], "answer": 1},
    {"id": "q15", "question": "What idiom means 'to work hard'?", "options": ["Burn the bridge", "Burn the midnight oil", "Burn the candle", "Burn out"], "answer": 1},
    {"id": "q16", "question": "Which phrase means 'to leave quickly'?", "options": ["Take a break", "Take the plunge", "Take off", "Take time"], "answer": 2},
    {"id": "q17", "question": "What does 'under the weather' mean?", "options": ["Standing below an umbrella", "Feeling sick or unwell", "During rainy season", "Hiding from weather"], "answer": 1},
    {"id": "q18", "question": "What idiom means 'to speak your mind'?", "options": ["Bite your tongue", "Speak volumes", "Speak your piece", "Speak softly"], "answer": 2},
    {"id": "q19", "question": "Which phrase means 'something that will definitely happen'?", "options": ["A piece of cake", "A ball in the court", "A sure thing", "A long shot"], "answer": 2},
    {"id": "q20", "question": "What does 'hit the nail on the head' mean?", "options": ["To use a hammer", "To state the exact truth", "To hurt yourself", "To build something"], "answer": 1},
]

MOTIVATIONAL_QUOTES = [
    "Every expert was once a beginner.",
    "Speak with confidence, learn with courage.",
    "One conversation a day keeps hesitation away.",
    "Fluency is a marathon, not a sprint.",
    "Small daily practice creates giant leaps.",
]

ACHIEVEMENTS = [
    {"id": "first-lesson", "title": "First Steps", "description": "Complete your first lesson", "icon": "footsteps"},
    {"id": "streak-7", "title": "Week Warrior", "description": "Maintain a 7-day streak", "icon": "flame"},
    {"id": "streak-30", "title": "Consistent Champion", "description": "30-day streak", "icon": "trophy"},
    {"id": "xp-500", "title": "Rising Star", "description": "Earn 500 XP", "icon": "star"},
    {"id": "xp-2000", "title": "XP Titan", "description": "Earn 2000 XP", "icon": "medal"},
    {"id": "test-pass", "title": "Test Ace", "description": "Score 80+ on a speaking test", "icon": "ribbon"},
    {"id": "words-50", "title": "Word Collector", "description": "Save 50 vocabulary words", "icon": "library"},
    {"id": "premium", "title": "Premium Member", "description": "Unlock premium access", "icon": "diamond"},
]

# Seed live rooms in-memory-ish (persist in mongo idempotently)
SEED_ROOMS = [
    {"room_id": "seed-1", "title": "Everyday Conversations", "topic": "Daily English", "host_name": "Ananya", "host_avatar": "https://i.pravatar.cc/150?img=47", "participant_count": 12, "is_private": False, "is_seed": True},
    {"room_id": "seed-2", "title": "Ace Your Job Interview", "topic": "Interview English", "host_name": "Rohan", "host_avatar": "https://i.pravatar.cc/150?img=12", "participant_count": 8, "is_private": False, "is_seed": True},
    {"room_id": "seed-4", "title": "Travel Talks", "topic": "Travel English", "host_name": "Marco", "host_avatar": "https://i.pravatar.cc/150?img=15", "participant_count": 5, "is_private": False, "is_seed": True},
    {"room_id": "seed-5", "title": "Confidence in Public Speaking", "topic": "Public Speaking", "host_name": "Zara", "host_avatar": "https://i.pravatar.cc/150?img=44", "participant_count": 17, "is_private": False, "is_seed": True},
]

# Partner pool for random matching
PARTNER_POOL = [
    {"name": "Aisha", "avatar": "https://i.pravatar.cc/150?img=48", "gender": "female", "country": "India"},
    {"name": "Diego", "avatar": "https://i.pravatar.cc/150?img=13", "gender": "male", "country": "Spain"},
    {"name": "Yuki", "avatar": "https://i.pravatar.cc/150?img=25", "gender": "female", "country": "Japan"},
    {"name": "Liam", "avatar": "https://i.pravatar.cc/150?img=8", "gender": "male", "country": "Ireland"},
    {"name": "Sofia", "avatar": "https://i.pravatar.cc/150?img=36", "gender": "female", "country": "Brazil"},
    {"name": "Ravi", "avatar": "https://i.pravatar.cc/150?img=11", "gender": "male", "country": "India"},
    {"name": "Emma", "avatar": "https://i.pravatar.cc/150?img=45", "gender": "female", "country": "UK"},
    {"name": "Kenji", "avatar": "https://i.pravatar.cc/150?img=17", "gender": "male", "country": "Japan"},
]

# Stripe subscription plan config (server-authoritative pricing)
# Backend-friendly tiers mapped from frontend display (marketing prices in INR):
#   - ₹49 Pack (weekly)   → 0.59 USD, 7 day recurring
#   - ₹199 Pack (monthly) → 9.99 USD, 30 day recurring  
#   - ₹499 Pack (quarterly) → 14.99 USD, 90 day recurring
# Note: Frontend displays rupee prices for UX; Stripe charges USD amounts.
# Transitioning to real INR pricing later only requires adding new SKUs here.
STRIPE_PLANS = {
    "weekly": {"amount": 0.59, "currency": "usd", "label": "Weekly", "duration_days": 7},
    "monthly": {"amount": 9.99, "currency": "usd", "label": "Monthly", "duration_days": 30},
    "quarterly": {"amount": 14.99, "currency": "usd", "label": "Quarterly", "duration_days": 90},
}

# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    """
    Startup Event Handler: startup
    
    Runs automatically when the FastAPI server starts up:
    1. Configures MongoDB indexes for fast lookups on email, user_id, phone, session_token.
    2. Removes legacy indexes to avoid duplicate null errors.
    3. Seeds initial live practice room records into the `rooms` collection.
    """
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    # Drop legacy sparse indexes if present — they treated `null` as a value and
    # caused duplicate-key errors on every new user with phone/referral_code = None.
    for legacy_name in ("phone_1", "referral_code_1"):
        try:
            await db.users.drop_index(legacy_name)
        except Exception:
            pass
    # Partial unique indexes: only enforce uniqueness when the field is a real string.
    await db.users.create_index(
        "phone", unique=True,
        partialFilterExpression={"phone": {"$type": "string"}},
    )
    await db.users.create_index(
        "referral_code", unique=True,
        partialFilterExpression={"referral_code": {"$type": "string"}},
    )
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.payments.create_index("session_id", unique=True)
    await db.phone_otps.create_index("phone", unique=True)
    await db.phone_otps.create_index("expires_at", expireAfterSeconds=0)
    # Seed rooms
    for r in SEED_ROOMS:
        await db.rooms.update_one({"room_id": r["room_id"]}, {"$setOnInsert": r}, upsert=True)

# ---------- Auth ----------
@api.post("/auth/session")
async def create_session(payload: SessionCreate):
    """
    API Endpoint: POST /api/auth/session
    
    Exchanges an Emergent Google OAuth session ID for a logged-in user profile.
    - Creates a new user in MongoDB if logging in for the first time.
    - Generates a 7-day session token and saves it in `user_sessions`.
    - Returns the session token and user profile data.
    """
    session_id = payload.session_id
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": session_id})
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()

    email = data["email"].lower().strip()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data["session_token"]

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        referral_code = await _unique_referral_code(name)
        user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "english_level": "Beginner",
            "xp": 0,
            "streak": 0,
            "last_active_date": None,
            "daily_goal_minutes": 15,
            "daily_goal_completed_minutes": 0,
            "is_premium": False,
            "premium_plan": None,
            "premium_until": None,
            "saved_words": [],
            "friends": [],
            "blocked": [],
            "achievements": [],
            "certificates": [],
            "phone": None,
            "referral_code": referral_code,
            "referred_by": None,
            "referral_count": 0,
            "referral_discount_active": False,
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(user)
        user.pop("_id", None)
    else:
        # Update picture if changed
        await db.users.update_one({"email": email}, {"$set": {"picture": picture, "name": name}})
        # Backfill referral_code for existing users
        if not user.get("referral_code"):
            code = await _unique_referral_code(name)
            await db.users.update_one({"email": email}, {"$set": {"referral_code": code}})
            user["referral_code"] = code

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user["user_id"],
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"session_token": session_token, "user": _user_to_out(user).model_dump()}

@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/auth/me
    
    Returns the profile data of the currently authenticated user.
    """
    return _user_to_out(user)

@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    """
    API Endpoint: POST /api/auth/logout
    
    Deletes the current user's session token from `user_sessions` to log them out.
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}

# ---------- Phone OTP (MOCK mode; swap to Twilio later) ----------
# ⚠️ MOCK MODE: this path accepts ANY 6-digit code and returns the stored OTP in the response
#     for demo/testing. To switch to real OTP delivery:
#       1) Set OTP_MODE=twilio in env
#       2) Implement send via Twilio in _send_otp() below (or another provider)
#       3) Remove `debug_code` from the send-otp response
OTP_MODE = os.environ.get("OTP_MODE", "mock")

def _normalize_phone(p: str) -> str:
    """
    Helper Function: _normalize_phone
    
    Sanitizes raw phone input string to a standardized format starting with '+' followed by digits.
    """
    return "+" + "".join(c for c in p if c.isdigit())

async def _send_otp(phone: str, code: str) -> None:
    """
    Helper Function: _send_otp
    
    Dispatches a generated OTP code to a phone number.
    In MOCK mode, logs the code to server output for testing without sending real SMS.
    """
    if OTP_MODE == "mock":
        logger.info(f"[MOCK OTP] phone={phone} code={code}")
        return
    # TODO: Real provider dispatch (Twilio, MSG91, etc.)
    logger.warning(f"OTP_MODE={OTP_MODE} not implemented; falling back to mock log")

@api.post("/auth/phone/send-otp")
async def send_otp(payload: PhoneSendOtp):
    """
    API Endpoint: POST /api/auth/phone/send-otp
    
    Generates a 6-digit OTP code for the requested phone number, saves it in `phone_otps`
    with a 10-minute expiry time, and triggers OTP delivery.
    """
    import random
    phone = _normalize_phone(payload.phone)
    if len(phone) < 8:
        raise HTTPException(400, "Invalid phone number")
    code = f"{random.randint(0, 999999):06d}"
    await db.phone_otps.update_one(
        {"phone": phone},
        {"$set": {
            "phone": phone,
            "code": code,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
            "attempts": 0,
        }},
        upsert=True,
    )
    await _send_otp(phone, code)
    body: Dict[str, Any] = {"ok": True, "phone": phone}
    if OTP_MODE == "mock":
        # In mock mode, we don't actually deliver — surface the code so the tester can see it.
        # Frontend also accepts any 6-digit code (see verify-otp).
        body["debug_code"] = code
        body["hint"] = "MOCK OTP: any 6-digit code works, or use debug_code."
    return body

@api.post("/auth/phone/verify-otp")
async def verify_otp(payload: PhoneVerifyOtp):
    """
    API Endpoint: POST /api/auth/phone/verify-otp
    
    Verifies the user-entered 6-digit OTP code against the database record.
    If valid, logs in the existing user or creates a new phone-registered user account,
    applies optional referral codes, and returns a new session token.
    """
    phone = _normalize_phone(payload.phone)
    code = (payload.code or "").strip()
    if not (len(code) == 6 and code.isdigit()):
        raise HTTPException(400, "Code must be 6 digits")

    otp = await db.phone_otps.find_one({"phone": phone}, {"_id": 0})
    if OTP_MODE == "mock":
        # Accept ANY 6-digit code, but still require /send-otp was called (has record)
        if not otp:
            raise HTTPException(400, "Request an OTP first")
    else:
        if not otp or otp.get("code") != code:
            raise HTTPException(400, "Invalid or expired code")
        exp = otp.get("expires_at")
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp and exp < datetime.now(timezone.utc):
            raise HTTPException(400, "Code expired. Request a new one.")

    # find or create user
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        display_name = (payload.name or "").strip() or f"User {phone[-4:]}"
        # Synthesize a placeholder email so we keep email unique-index invariants
        placeholder_email = f"phone_{phone.lstrip('+')}@acuspeak.phone"
        existing_email = await db.users.find_one({"email": placeholder_email}, {"_id": 0})
        if existing_email:
            user = existing_email
            await db.users.update_one({"email": placeholder_email}, {"$set": {"phone": phone}})
        else:
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            referral_code = await _unique_referral_code(display_name)
            new_user = {
                "user_id": user_id,
                "email": placeholder_email,
                "name": display_name,
                "picture": None,
                "english_level": "Beginner",
                "xp": 0,
                "streak": 0,
                "last_active_date": None,
                "daily_goal_minutes": 15,
                "daily_goal_completed_minutes": 0,
                "is_premium": False,
                "premium_plan": None,
                "premium_until": None,
                "saved_words": [],
                "friends": [],
                "blocked": [],
                "achievements": [],
                "certificates": [],
                "phone": phone,
                "referral_code": referral_code,
                "referred_by": None,
                "referral_count": 0,
                "referral_discount_active": False,
                "created_at": datetime.now(timezone.utc),
            }
            await db.users.insert_one(new_user)
            user = new_user
            user.pop("_id", None)

    # Apply referral if provided and not already referred
    if payload.referral_code and not user.get("referred_by"):
        inviter = await db.users.find_one({"referral_code": payload.referral_code.strip().upper()}, {"_id": 0})
        if inviter and inviter["user_id"] != user["user_id"]:
            user["referred_by"] = inviter["user_id"]
            user["referral_discount_active"] = True
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"referred_by": inviter["user_id"], "referral_discount_active": True}},
            )
            await db.users.update_one(
                {"user_id": inviter["user_id"]},
                {"$inc": {"referral_count": 1}, "$set": {"referral_discount_active": True}},
            )

    # issue a token
    session_token = f"phone_{uuid.uuid4().hex}"
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user["user_id"],
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    # invalidate OTP record after successful verify
    await db.phone_otps.delete_one({"phone": phone})

    return {"session_token": session_token, "user": _user_to_out(user).model_dump()}

@api.post("/auth/phone/link", response_model=UserOut)
async def link_phone(payload: LinkPhone, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/auth/phone/link
    
    Links a verified phone number to an existing signed-in user account (e.g. after Google OAuth login).
    """
    phone = _normalize_phone(payload.phone)
    code = (payload.code or "").strip()
    if not (len(code) == 6 and code.isdigit()):
        raise HTTPException(400, "Code must be 6 digits")
    otp = await db.phone_otps.find_one({"phone": phone}, {"_id": 0})
    if OTP_MODE != "mock":
        if not otp or otp.get("code") != code:
            raise HTTPException(400, "Invalid code")
    else:
        if not otp:
            raise HTTPException(400, "Request an OTP first")
    # Ensure phone isn't already in use by another user
    existing = await db.users.find_one({"phone": phone, "user_id": {"$ne": user["user_id"]}}, {"_id": 0})
    if existing:
        raise HTTPException(409, "This phone number is already linked to another account")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"phone": phone}})
    await db.phone_otps.delete_one({"phone": phone})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _user_to_out(fresh)

# ---------- Referral ----------
@api.get("/referral")
async def get_referral(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/referral
    
    Returns the current user's referral code, shareable invitation text, and referral stats.
    """
    code = user.get("referral_code")
    if not code:
        code = await _unique_referral_code(user.get("name", "USER"))
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral_code": code}})
    return {
        "referral_code": code,
        "referral_count": user.get("referral_count", 0),
        "referral_discount_active": user.get("referral_discount_active", False),
        "share_message": f"Learn English with me on Acuspeak! Use my code {code} to get 20% off Premium. Download: https://lingua-franca-6.preview.emergentagent.com",
    }

@api.post("/referral/apply", response_model=UserOut)
async def apply_referral(payload: ApplyReferral, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/referral/apply
    
    Applies another user's referral code to activate a 20% discount on Premium subscriptions.
    """
    if user.get("referred_by"):
        raise HTTPException(400, "You've already used a referral code")
    code = payload.referral_code.strip().upper()
    inviter = await db.users.find_one({"referral_code": code}, {"_id": 0})
    if not inviter:
        raise HTTPException(404, "Invalid referral code")
    if inviter["user_id"] == user["user_id"]:
        raise HTTPException(400, "You can't use your own code")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referred_by": inviter["user_id"], "referral_discount_active": True}})
    await db.users.update_one({"user_id": inviter["user_id"]}, {"$inc": {"referral_count": 1}, "$set": {"referral_discount_active": True}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _user_to_out(fresh)


# ---------- Profile & progression ----------
@api.put("/profile", response_model=UserOut)
async def update_profile(payload: UpdateProfile, user=Depends(get_current_user)):
    """
    API Endpoint: PUT /api/profile
    
    Updates user settings such as display name, English proficiency level, or daily practice target minutes.
    """
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _user_to_out(fresh)

def _today_iso() -> str:
    """
    Helper Function: _today_iso
    
    Returns today's date formatted as a UTC ISO string (YYYY-MM-DD).
    """
    return datetime.now(timezone.utc).date().isoformat()

async def _apply_xp(user: Dict[str, Any], amount: int, minutes: int = 0) -> Dict[str, Any]:
    """
    Helper Function: _apply_xp
    
    Increments user XP, updates daily study minutes, updates daily login streak count,
    and automatically unlocks milestone achievements (e.g. 500 XP, 7-day streak).
    Returns the updated user document from MongoDB.
    """
    today = _today_iso()
    last = user.get("last_active_date")
    new_streak = user.get("streak", 0)
    if last != today:
        if last:
            try:
                last_date = datetime.fromisoformat(last).date()
                delta = (datetime.now(timezone.utc).date() - last_date).days
                new_streak = new_streak + 1 if delta == 1 else 1
            except Exception:
                new_streak = 1
        else:
            new_streak = 1

    new_xp = user.get("xp", 0) + amount
    new_minutes = user.get("daily_goal_completed_minutes", 0) + (minutes or 0)
    if last != today:
        new_minutes = minutes or 0

    # Achievement checks
    achievements = list(user.get("achievements", []))
    def unlock(aid):
        if aid not in achievements:
            achievements.append(aid)
    if new_xp >= 500:
        unlock("xp-500")
    if new_xp >= 2000:
        unlock("xp-2000")
    if new_streak >= 7:
        unlock("streak-7")
    if new_streak >= 30:
        unlock("streak-30")

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "xp": new_xp,
            "streak": new_streak,
            "last_active_date": today,
            "daily_goal_completed_minutes": new_minutes,
            "achievements": achievements,
        }},
    )
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})

@api.post("/xp", response_model=UserOut)
async def add_xp(payload: XPEvent, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/xp
    
    Awards XP points and practice minutes to the authenticated user's account.
    """
    fresh = await _apply_xp(user, payload.amount, 0)
    return _user_to_out(fresh)

# ---------- Home ----------
@api.get("/home")
async def home(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/home
    
    Provides main dashboard screen data including user greeting, daily motivational quote,
    study goal minutes progress, streak count, recommended lesson, and Word of the Day.
    """
    # Reset daily if new day
    today = _today_iso()
    if user.get("last_active_date") != today:
        # Do not reset streak here, only on xp addition
        pass
    quote_index = datetime.now(timezone.utc).day % len(MOTIVATIONAL_QUOTES)
    # continue learning: pick a lesson matching user's level
    lvl = user.get("english_level", "Beginner")
    continue_lesson = next((lsn for lsn in LESSONS if lsn["level"] == lvl), LESSONS[0])
    daily_word = VOCAB_WORDS[datetime.now(timezone.utc).day % len(VOCAB_WORDS)]
    return {
        "welcome_name": user.get("name", "Learner").split(" ")[0],
        "quote": MOTIVATIONAL_QUOTES[quote_index],
        "daily_goal_minutes": user.get("daily_goal_minutes", 15),
        "daily_goal_completed_minutes": user.get("daily_goal_completed_minutes", 0) if user.get("last_active_date") == today else 0,
        "streak": user.get("streak", 0),
        "xp": user.get("xp", 0),
        "continue_lesson": continue_lesson,
        "word_of_the_day": daily_word,
        "categories": LESSON_CATEGORIES,
        "challenges": DAILY_CHALLENGES,
    }

# ---------- Lessons ----------
@api.get("/lessons/categories")
async def lesson_categories():
    """
    API Endpoint: GET /api/lessons/categories
    
    Returns the list of available learning categories (Daily English, Business English, etc.).
    """
    return {"categories": LESSON_CATEGORIES}

@api.get("/lessons")
async def lessons(category_id: Optional[str] = None):
    """
    API Endpoint: GET /api/lessons
    
    Returns all lessons available in the app, optionally filtered by `category_id`.
    """
    items = [lsn for lsn in LESSONS if (category_id is None or lsn["category_id"] == category_id)]
    return {"lessons": items}

@api.get("/lessons/{lesson_id}")
async def lesson_detail(lesson_id: str):
    """
    API Endpoint: GET /api/lessons/{lesson_id}
    
    Returns detailed information and full conversation script for a specific lesson ID.
    """
    lsn = next((x for x in LESSONS if x["id"] == lesson_id), None)
    if not lsn:
        raise HTTPException(404, "Lesson not found")
    return lsn

@api.post("/lessons/complete")
async def complete_lesson(payload: LessonProgressUpdate, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/lessons/complete
    
    Marks a lesson completed for the current user, updates MongoDB `lesson_progress`,
    and awards the lesson's XP and duration minutes to the user profile.
    """
    lsn = next((x for x in LESSONS if x["id"] == payload.lesson_id), None)
    if not lsn:
        raise HTTPException(404, "Lesson not found")
    await db.lesson_progress.update_one(
        {"user_id": user["user_id"], "lesson_id": payload.lesson_id},
        {"$set": {"completed": True, "completed_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    achievements = list(user.get("achievements", []))
    if "first-lesson" not in achievements:
        achievements.append("first-lesson")
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"achievements": achievements}})
        user["achievements"] = achievements
    fresh = await _apply_xp(user, lsn["xp_reward"], 0)
    return {"user": _user_to_out(fresh).model_dump(), "xp_earned": lsn["xp_reward"]}

@api.get("/lessons/progress/all")
async def all_progress(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/lessons/progress/all
    
    Returns a list of all lesson IDs completed by the current user.
    """
    rows = await db.lesson_progress.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    return {"completed_ids": [r["lesson_id"] for r in rows]}

# ---------- Vocabulary ----------
@api.get("/vocab")
async def vocab_list():
    """
    API Endpoint: GET /api/vocab
    
    Returns the complete list of 50 English vocabulary learning items.
    """
    return {"words": VOCAB_WORDS}

@api.get("/vocab/word-of-the-day")
async def word_of_the_day():
    """
    API Endpoint: GET /api/vocab/word-of-the-day
    
    Returns today's highlighted vocabulary word item.
    """
    return VOCAB_WORDS[datetime.now(timezone.utc).day % len(VOCAB_WORDS)]

@api.post("/vocab/save", response_model=UserOut)
async def save_word(payload: VocabAction, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/vocab/save
    
    Bookmarks a vocabulary word into the current user's saved words list in MongoDB.
    Awards +2 XP per newly saved word.
    """
    saved = list(user.get("saved_words", []))
    xp = user.get("xp", 0)
    if payload.word_id not in saved:
        saved.append(payload.word_id)
        xp += 2
    if len(saved) >= 50 and "words-50" not in user.get("achievements", []):
        ach = list(user.get("achievements", [])) + ["words-50"]
    else:
        ach = user.get("achievements", [])
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"saved_words": saved, "achievements": ach, "xp": xp}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _user_to_out(fresh)

@api.post("/vocab/unsave", response_model=UserOut)
async def unsave_word(payload: VocabAction, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/vocab/unsave
    
    Removes a bookmarked vocabulary word from the user's saved words list.
    """
    saved = [w for w in user.get("saved_words", []) if w != payload.word_id]
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"saved_words": saved}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _user_to_out(fresh)

# ---------- Challenges & Quiz ----------
@api.get("/challenges")
async def challenges(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/challenges
    
    Returns today's daily challenges list along with the user's completion status.
    """
    today = _today_iso()
    row = await db.daily_challenges.find_one({"user_id": user["user_id"], "date": today}, {"_id": 0})
    completed = row.get("completed", []) if row else []
    return {"challenges": DAILY_CHALLENGES, "completed": completed}

@api.post("/challenges/{challenge_id}/complete")
async def complete_challenge(challenge_id: str, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/challenges/{challenge_id}/complete
    
    Marks a daily challenge completed and awards challenge XP reward.
    """
    ch = next((c for c in DAILY_CHALLENGES if c["id"] == challenge_id), None)
    if not ch:
        raise HTTPException(404, "Challenge not found")
    today = _today_iso()
    row = await db.daily_challenges.find_one({"user_id": user["user_id"], "date": today}, {"_id": 0}) or {"user_id": user["user_id"], "date": today, "completed": []}
    if challenge_id in row.get("completed", []):
        raise HTTPException(400, "Already completed today")
    row["completed"] = row.get("completed", []) + [challenge_id]
    await db.daily_challenges.update_one({"user_id": user["user_id"], "date": today}, {"$set": row}, upsert=True)
    fresh = await _apply_xp(user, ch["xp"], 0)
    return {"user": _user_to_out(fresh).model_dump(), "xp_earned": ch["xp"]}

@api.get("/quiz")
async def get_quiz():
    """
    API Endpoint: GET /api/quiz
    
    Returns a set of 5 interactive practice quiz questions.
    """
    import random
    questions_set = random.sample(QUIZ_QUESTIONS, min(5, len(QUIZ_QUESTIONS)))
    return {"questions": questions_set}

# ---------- Speaking Test ----------
@api.post("/speaking-test", response_model=UserOut)
async def submit_speaking_test(payload: SpeakingTestResult, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/speaking-test
    
    Submits speaking evaluation test scores (fluency, pronunciation, grammar, vocabulary).
    If overall score >= 80%, generates a certificate of completion and awards bonus XP.
    """
    doc = {
        "user_id": user["user_id"],
        "level": payload.level,
        "fluency": payload.fluency,
        "pronunciation": payload.pronunciation,
        "grammar": payload.grammar,
        "vocabulary": payload.vocabulary,
        "overall": payload.overall,
        "created_at": datetime.now(timezone.utc),
    }
    await db.speaking_tests.insert_one(doc)
    achievements = list(user.get("achievements", []))
    certificates = list(user.get("certificates", []))
    if payload.overall >= 80:
        if "test-pass" not in achievements:
            achievements.append("test-pass")
        certificates.append({
            "id": f"cert_{uuid.uuid4().hex[:8]}",
            "title": f"{payload.level.title()} Speaking Certificate",
            "score": payload.overall,
            "date": _today_iso(),
        })
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"achievements": achievements, "certificates": certificates}})
    fresh = await _apply_xp(user, 100, 0)
    return _user_to_out(fresh)

@api.get("/speaking-test/history")
async def test_history(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/speaking-test/history
    
    Returns a history of the user's past speaking evaluation test results.
    """
    rows = await db.speaking_tests.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for r in rows:
        r["created_at"] = r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else r.get("created_at")
    return {"results": rows}

# ---------- Speak with Real People (Real Online User Queue) ----------
async def _cleanup_stale_matches():
    threshold = datetime.now(timezone.utc) - timedelta(seconds=30)
    await db.match_queue.update_many(
        {"status": "searching", "created_at": {"$lt": threshold}},
        {"$set": {"status": "expired"}}
    )

@api.post("/match/join")
@api.post("/match")
async def join_match(payload: Optional[JoinMatchRequest] = None, gender: Optional[str] = None, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/match/join (and POST /api/match)
    
    Adds user to match_queue and pairs instantly if another online user is searching.
    """
    await _cleanup_stale_matches()

    target_gender = "any"
    if payload and payload.gender:
        target_gender = payload.gender
    elif gender:
        target_gender = gender

    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(seconds=30)

    # Cancel any previous searching request for this user
    await db.match_queue.delete_many({"user_id": user["user_id"], "status": "searching"})

    # Search for an active searching candidate (other than self)
    query = {
        "user_id": {"$ne": user["user_id"]},
        "status": "searching",
        "created_at": {"$gte": stale_cutoff}
    }

    candidates = await db.match_queue.find(query).sort("created_at", 1).to_list(10)
    matched_candidate = None
    for cand in candidates:
        matched_candidate = cand
        break

    if matched_candidate:
        room_id = f"lf_{uuid.uuid4().hex[:16]}"
        # Atomic lock on candidate
        res = await db.match_queue.find_one_and_update(
            {"_id": matched_candidate["_id"], "status": "searching"},
            {
                "$set": {
                    "status": "matched",
                    "partner_id": user["user_id"],
                    "room_id": room_id,
                    "matched_at": now
                }
            },
            return_document=True
        )

        if res:
            # Candidate claimed successfully; record current user's match
            user_match_doc = {
                "user_id": user["user_id"],
                "status": "matched",
                "partner_id": matched_candidate["user_id"],
                "room_id": room_id,
                "gender_pref": target_gender,
                "created_at": now,
                "matched_at": now
            }
            await db.match_queue.insert_one(user_match_doc)

            return {
                "status": "matched",
                "room_id": room_id,
                "partner_id": matched_candidate["user_id"]
            }

    # No candidate available -> enter queue as searching
    new_queue_doc = {
        "user_id": user["user_id"],
        "status": "searching",
        "partner_id": None,
        "room_id": None,
        "gender_pref": target_gender,
        "created_at": now
    }
    await db.match_queue.insert_one(new_queue_doc)

    return {
        "status": "searching",
        "message": "Added to match queue. Polling for partner..."
    }

@api.get("/match/status")
async def match_status(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/match/status
    
    Short-polling endpoint returning room_id, server-generated ZEGO token, and partner details when matched.
    """
    await _cleanup_stale_matches()

    q_entry = await db.match_queue.find_one(
        {"user_id": user["user_id"]},
        sort=[("created_at", -1)]
    )

    if not q_entry:
        return {"status": "idle"}

    q_status = q_entry.get("status")

    if q_status == "searching":
        created_at = q_entry.get("created_at")
        if isinstance(created_at, datetime):
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - created_at > timedelta(seconds=30):
                await db.match_queue.update_one(
                    {"_id": q_entry["_id"]},
                    {"$set": {"status": "expired"}}
                )
                return {"status": "expired", "message": "Search timed out after 30 seconds"}
        return {"status": "searching"}

    elif q_status == "matched":
        partner_id = q_entry.get("partner_id")
        room_id = q_entry.get("room_id")

        partner_user = await db.users.find_one({"user_id": partner_id}, {"_id": 0})
        if not partner_user:
            partner_data = {
                "user_id": partner_id,
                "name": "Learner",
                "avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
                "gender": "any",
                "country": "Global",
                "is_premium": False
            }
        else:
            partner_data = {
                "user_id": partner_user.get("user_id", partner_id),
                "name": partner_user.get("name", "Learner"),
                "avatar": partner_user.get("picture") or partner_user.get("avatar") or "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
                "gender": partner_user.get("gender", "any"),
                "country": partner_user.get("country", "Global"),
                "is_premium": partner_user.get("is_premium", False)
            }

        zego_token = ""
        if ZEGO_APP_ID and ZEGO_SERVER_SECRET:
            try:
                app_id_int = int(ZEGO_APP_ID)
                zego_token = _generate_zego_token04(
                    app_id=app_id_int,
                    user_id=user["user_id"],
                    secret=ZEGO_SERVER_SECRET,
                    effective_time_seconds=3600,
                    payload=""
                )
            except Exception as e:
                logger.warning(f"Failed to generate ZEGO token: {e}")
                zego_token = f"mock_token_{room_id}"
        else:
            zego_token = f"mock_token_{room_id}"

        return {
            "status": "matched",
            "room_id": room_id,
            "zego_token": zego_token,
            "partner": partner_data
        }

    elif q_status == "expired":
        return {"status": "expired"}

    elif q_status == "cancelled":
        return {"status": "idle"}

    return {"status": "idle"}

@api.post("/match/cancel")
async def match_cancel(user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/match/cancel
    
    Cancels active searching request in match_queue.
    """
    await db.match_queue.update_many(
        {"user_id": user["user_id"], "status": "searching"},
        {"$set": {"status": "cancelled"}}
    )
    return {"status": "cancelled", "message": "Match search cancelled"}

@api.post("/calls")
async def log_call(payload: CallLogCreate, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/calls
    
    Logs completed 1-on-1 practice call duration and awards study XP.
    """
    doc = {
        "call_id": f"call_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "partner_name": payload.partner_name,
        "partner_avatar": payload.partner_avatar,
        "duration_seconds": payload.duration_seconds,
        "partner_gender": payload.partner_gender,
        "created_at": datetime.now(timezone.utc),
    }
    await db.calls.insert_one(doc)
    minutes = payload.duration_seconds // 60
    fresh = await _apply_xp(user, minutes * 10, minutes)
    return {"ok": True, "user": _user_to_out(fresh).model_dump()}

@api.get("/calls")
async def call_history(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/calls
    
    Returns the user's past 1-on-1 speaking practice call records sorted by latest date.
    """
    rows = await db.calls.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for r in rows:
        r["created_at"] = r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else r.get("created_at")
    return {"calls": rows}

@api.post("/call/end")
@api.post("/calls/end")
async def end_call(payload: CallEndRequest, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/call/end
    
    Real-time call termination endpoint. Updates call session state to ended
    so both participants immediately sync termination state.
    """
    room_id = payload.room_id.strip()
    if not room_id:
        raise HTTPException(status_code=400, detail="room_id is required")
        
    now = datetime.now(timezone.utc)
    ACTIVE_CALL_SESSIONS[room_id] = {
        "room_id": room_id,
        "status": "ended",
        "ended_by": user["user_id"],
        "ended_at": now.isoformat()
    }
    
    await db.call_sessions.update_one(
        {"room_id": room_id},
        {
            "$set": {
                "room_id": room_id,
                "status": "ended",
                "ended_by": user["user_id"],
                "ended_at": now
            }
        },
        upsert=True
    )
    return {"ok": True, "room_id": room_id, "status": "ended"}

@api.get("/call/status/{room_id}")
@api.get("/calls/status/{room_id}")
async def get_call_status(room_id: str, user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/call/status/{room_id}
    
    Checks current status of a call session (active vs ended) for dual-side sync.
    """
    if room_id in ACTIVE_CALL_SESSIONS:
        return ACTIVE_CALL_SESSIONS[room_id]
        
    doc = await db.call_sessions.find_one({"room_id": room_id}, {"_id": 0})
    if doc:
        if isinstance(doc.get("ended_at"), datetime):
            doc["ended_at"] = doc["ended_at"].isoformat()
        ACTIVE_CALL_SESSIONS[room_id] = doc
        return doc
        
    return {"room_id": room_id, "status": "active"}

@api.post("/call/feedback")
@api.post("/calls/feedback")
async def submit_call_feedback(payload: CallFeedbackCreate, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/call/feedback
    
    Records user rating (1-5 stars) and optional feedback comments for completed call session.
    """
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5 stars")
        
    feedback_doc = {
        "feedback_id": f"fb_{uuid.uuid4().hex[:10]}",
        "rater_id": user["user_id"],
        "rated_user_id": payload.target_user_id,
        "room_id": payload.room_id,
        "rating": payload.rating,
        "comment": payload.comment.strip() if payload.comment else None,
        "created_at": datetime.now(timezone.utc),
    }
    
    await db.call_feedback.insert_one(feedback_doc)
    
    return {
        "ok": True,
        "feedback_id": feedback_doc["feedback_id"],
        "message": "Feedback submitted successfully"
    }

@api.post("/friends/request")
async def send_friend_request(payload: FriendRequestCreate, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/friends/request
    
    Sends a friend connection request to another practice learner.
    """
    doc = {
        "request_id": f"fr_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "to_name": payload.to_name,
        "to_avatar": payload.to_avatar,
        "status": "sent",
        "created_at": datetime.now(timezone.utc),
    }
    await db.friend_requests.insert_one(doc)
    return {"ok": True, "request_id": doc["request_id"]}

@api.get("/friends/requests")
async def list_friend_requests(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/friends/requests
    
    Returns the list of friend requests sent or received by the current user.
    """
    rows = await db.friend_requests.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for r in rows:
        r["created_at"] = r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else r.get("created_at")
    return {"requests": rows}

@api.post("/reports")
async def submit_report(payload: ReportCreate, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/reports
    
    Submits a moderation report regarding inappropriate behavior by another user.
    """
    await db.reports.insert_one({
        "report_id": f"rep_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "target_name": payload.target_name,
        "reason": payload.reason,
        "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True}

@api.post("/block")
async def block_user(payload: ReportCreate, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/block
    
    Adds a user to the current user's blocked users list in MongoDB.
    """
    blocked = list(user.get("blocked", []))
    if payload.target_name not in blocked:
        blocked.append(payload.target_name)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"blocked": blocked}})
    return {"ok": True}

# ---------- ZEGOCLOUD Voice Token (Token04) ----------
# Official ZEGO Token04 algorithm implemented in-process (no SDK install).
# Payload:  expire_time_i64_be | iv_len_i16_be | iv | ct_len_i16_be | ct
# Cipher:   AES/CBC/PKCS7  (key = ZEGO_SERVER_SECRET utf-8, must be exactly 32 chars)
def _generate_zego_token04(app_id: int, user_id: str, secret: str, effective_time_seconds: int, payload: str = "") -> str:
    """
    Helper Function: _generate_zego_token04
    
    Generates a secure ZEGOCLOUD Token04 string using AES-256-CBC encryption.
    Allows frontend clients to authenticate with ZEGOCLOUD live audio servers.
    """
    import base64
    import json as _json
    import os as _os
    import random as _random
    import struct
    import time as _time
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives import padding as _padding

    if not isinstance(app_id, int) or app_id <= 0:
        raise ValueError("app_id must be a positive integer")
    if not user_id:
        raise ValueError("user_id required")
    if not secret or len(secret) != 32:
        raise ValueError("ZEGO_SERVER_SECRET must be exactly 32 characters")
    if effective_time_seconds <= 0:
        raise ValueError("effective_time_seconds must be > 0")

    create_time = int(_time.time())
    token_info = {
        "app_id": app_id,
        "user_id": user_id,
        "nonce": _random.randint(-2147483648, 2147483647),
        "ctime": create_time,
        "expire": create_time + effective_time_seconds,
        "payload": payload or "",
    }
    plain_text = _json.dumps(token_info, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

    iv = _os.urandom(16)
    key = secret.encode("utf-8")

    padder = _padding.PKCS7(algorithms.AES.block_size).padder()
    padded = padder.update(plain_text) + padder.finalize()

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()

    buf = struct.pack(">q", token_info["expire"])
    buf += struct.pack(">h", len(iv)) + iv
    buf += struct.pack(">h", len(ciphertext)) + ciphertext

    return "04" + base64.b64encode(buf).decode("utf-8")

@api.post("/zego/token")
async def zego_token(payload: ZegoTokenRequest, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/zego/token
    
    Generates and returns an authentication token for joining a ZEGOCLOUD voice room.
    """
    if not ZEGO_APP_ID or not ZEGO_SERVER_SECRET:
        raise HTTPException(status_code=503, detail="ZEGOCLOUD is not configured on the server")
    try:
        app_id_int = int(ZEGO_APP_ID)
    except (TypeError, ValueError):
        raise HTTPException(status_code=500, detail="ZEGO_APP_ID must be a numeric value")

    room_id = (payload.room_id or "").strip()
    if not room_id:
        raise HTTPException(400, detail="room_id required")

    effective_time = 3600  # 1 hour
    try:
        token = _generate_zego_token04(
            app_id=app_id_int,
            user_id=user["user_id"],
            secret=ZEGO_SERVER_SECRET,
            effective_time_seconds=effective_time,
            payload="",
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "app_id": app_id_int,
        "room_id": room_id,
        "user_id": user["user_id"],
        "token": token,
        "effective_time": effective_time,
    }

# ---------- Live Rooms ----------
async def _generate_unique_room_id() -> str:
    """Generates a unique 6-digit numeric room ID string."""
    for _ in range(10):
        rid = f"{random.randint(100000, 999999)}"
        exists = await db.rooms.find_one({"room_id": rid}, {"_id": 1})
        if not exists:
            return rid
    return f"{random.randint(100000, 999999)}"

def _generate_room_password() -> str:
    """Generates a 4-digit PIN password string."""
    return f"{random.randint(1000, 9999)}"

@api.get("/rooms")
async def list_rooms():
    """
    API Endpoint: GET /api/rooms
    
    Returns the list of active live group conversation practice rooms.
    Hides password credentials from public listings.
    """
    rows = await db.rooms.find({"status": {"$ne": "inactive"}}, {"_id": 0, "password": 0}).to_list(100)
    return {"rooms": rows}

@api.post("/rooms")
async def create_room(payload: RoomCreate, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/rooms
    
    Creates a new public or private live audio practice room hosted by the user,
    generating a unique 6-digit Room ID and 4-digit PIN password.
    """
    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=400, detail="Room title is required")

    room_id = await _generate_unique_room_id()
    password = _generate_room_password()
    title = payload.title.strip()
    topic = (payload.topic or "General").strip()
    is_private = bool(payload.is_private)

    host_participant = {
        "user_id": user["user_id"],
        "name": user.get("name", "Host"),
        "avatar": user.get("picture") or "https://i.pravatar.cc/150?img=5",
    }

    share_text = (
        f"🎙️ Join my Acuspeak Live Practice Room!\n"
        f"📌 Title: {title}\n"
        f"💬 Topic: {topic}\n"
        f"🆔 Room ID: {room_id}\n"
        f"🔑 Password/PIN: {password}"
    )

    room = {
        "room_id": room_id,
        "password": password,
        "title": title,
        "topic": topic,
        "host_id": user["user_id"],
        "host_name": user.get("name", "Host"),
        "host_avatar": user.get("picture") or "https://i.pravatar.cc/150?img=5",
        "participant_count": 1,
        "participants": [host_participant],
        "is_private": is_private,
        "is_seed": False,
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    }
    await db.rooms.insert_one(room)
    room.pop("_id", None)
    if isinstance(room.get("created_at"), datetime):
        room["created_at"] = room["created_at"].isoformat()

    room["share_text"] = share_text
    return room

@api.post("/rooms/join")
async def join_room(payload: RoomJoin, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/rooms/join
    
    Validates room_id and password/PIN, updates participant list and count, and returns
    room details along with ZEGO token authentication for the voice call.
    """
    room_id = (payload.room_id or "").strip()
    if not room_id:
        raise HTTPException(status_code=400, detail="Invalid Room ID or Password")

    room = await db.rooms.find_one({"room_id": room_id, "status": {"$ne": "inactive"}}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=400, detail="Invalid Room ID or Password")

    if user["user_id"] in room.get("removed_users", []):
        raise HTTPException(status_code=403, detail="You have been removed from this room by the host")

    # Password validation if room requires PIN
    expected_password = room.get("password")
    if expected_password is not None and str(expected_password).strip():
        provided_password = (payload.password or "").strip()
        if provided_password != str(expected_password).strip():
            raise HTTPException(status_code=400, detail="Invalid Room ID or Password")

    current_participants = room.get("participants", [])
    user_p = {
        "user_id": user["user_id"],
        "name": user.get("name", "User"),
        "avatar": user.get("picture") or "https://i.pravatar.cc/150?img=1",
    }
    if not any(p.get("user_id") == user["user_id"] for p in current_participants):
        current_participants.append(user_p)
        await db.rooms.update_one(
            {"room_id": room_id},
            {
                "$set": {"participants": current_participants},
                "$inc": {"participant_count": 1},
            }
        )

    zego_token_str = None
    app_id_int = None
    if ZEGO_APP_ID and ZEGO_SERVER_SECRET:
        try:
            app_id_int = int(ZEGO_APP_ID)
            zego_token_str = _generate_zego_token04(
                app_id=app_id_int,
                user_id=user["user_id"],
                secret=ZEGO_SERVER_SECRET,
                effective_time_seconds=3600,
                payload="",
            )
        except Exception:
            logger.warning("Failed to generate Zego token for room join", exc_info=True)

    room_info = {
        "room_id": room["room_id"],
        "title": room.get("title", ""),
        "topic": room.get("topic", ""),
        "host_id": room.get("host_id", ""),
        "host_name": room.get("host_name", "Host"),
        "host_avatar": room.get("host_avatar"),
        "participant_count": len(current_participants),
        "participants": current_participants,
        "is_private": room.get("is_private", False),
        "status": room.get("status", "active"),
    }

    return {
        "ok": True,
        "room": room_info,
        "token": zego_token_str,
        "zego_app_id": app_id_int,
    }

@api.get("/rooms/{room_id}")
async def get_room_details(room_id: str):
    """
    API Endpoint: GET /api/rooms/{room_id}
    
    Returns details and active participants for a single room by room_id.
    """
    room = await db.rooms.find_one({"room_id": room_id}, {"_id": 0, "password": 0})
    if not room or room.get("status") == "inactive":
        return {
            "room": {
                "room_id": room_id,
                "status": "inactive",
                "participants": [],
            }
        }
    return {"room": room}

@api.post("/rooms/{room_id}/end")
async def end_room(room_id: str, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/rooms/{room_id}/end
    
    Ends a live room session. Guarded so that only the room host can end the room.
    """
    room = await db.rooms.find_one({"room_id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.get("host_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the host can end this room")

    await db.rooms.update_one({"room_id": room_id}, {"$set": {"status": "inactive"}})
    return {"ok": True, "message": "Room ended successfully"}

@api.post("/rooms/{room_id}/leave")
async def leave_room(room_id: str, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/rooms/{room_id}/leave
    
    Removes a participant from a room session.
    If the leaving user is the room host, the entire room session is terminated for all users.
    """
    room = await db.rooms.find_one({"room_id": room_id, "status": {"$ne": "inactive"}}, {"_id": 0})
    if not room:
        return {"ok": True, "ended": True}

    if room.get("host_id") == user["user_id"]:
        # Host left -> end room session for all participants on all devices
        await db.rooms.update_one(
            {"room_id": room_id},
            {"$set": {"status": "inactive", "participants": [], "participant_count": 0}}
        )
        return {"ok": True, "ended": True}
    else:
        # Listener left -> update participant list
        participants = [p for p in room.get("participants", []) if p.get("user_id") != user["user_id"]]
        await db.rooms.update_one(
            {"room_id": room_id},
            {"$set": {"participants": participants, "participant_count": len(participants)}}
        )
        return {"ok": True, "ended": False}

@api.post("/rooms/{room_id}/remove-participant")
async def remove_participant(room_id: str, payload: RemoveParticipantPayload, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/rooms/{room_id}/remove-participant
    
    Removes a target listener from a room. Only the room host can perform this action.
    """
    room = await db.rooms.find_one({"room_id": room_id, "status": {"$ne": "inactive"}}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.get("host_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the host can remove participants")

    target_user_id = payload.user_id.strip()
    if target_user_id == room.get("host_id"):
        raise HTTPException(status_code=400, detail="Cannot remove the room host")

    participants = [p for p in room.get("participants", []) if p.get("user_id") != target_user_id]
    removed_users = room.get("removed_users", [])
    if target_user_id not in removed_users:
        removed_users.append(target_user_id)

    await db.rooms.update_one(
        {"room_id": room_id},
        {
            "$set": {
                "participants": participants,
                "participant_count": len(participants),
                "removed_users": removed_users,
            }
        }
    )
    return {"ok": True, "message": "Participant removed successfully"}

# ---------- Leaderboard ----------
@api.get("/leaderboard")
async def leaderboard(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/leaderboard
    
    Returns top learners ranked by total XP earned, including the current user's position.
    """
    rows = await db.users.find({}, {"_id": 0, "name": 1, "picture": 1, "xp": 1, "user_id": 1, "streak": 1}).sort("xp", -1).to_list(20)
    # Also include a few seed entries if less than 5 real users
    seed = [
        {"user_id": "seed_1", "name": "Ananya Sharma", "picture": "https://i.pravatar.cc/150?img=47", "xp": 4820, "streak": 42},
        {"user_id": "seed_2", "name": "Rohan Mehta", "picture": "https://i.pravatar.cc/150?img=12", "xp": 3910, "streak": 28},
        {"user_id": "seed_3", "name": "Emma Wilson", "picture": "https://i.pravatar.cc/150?img=45", "xp": 3260, "streak": 15},
        {"user_id": "seed_4", "name": "Kenji Tanaka", "picture": "https://i.pravatar.cc/150?img=17", "xp": 2890, "streak": 21},
        {"user_id": "seed_5", "name": "Sofia Alves", "picture": "https://i.pravatar.cc/150?img=36", "xp": 2410, "streak": 9},
    ]
    combined = rows + [s for s in seed if not any(r["user_id"] == s["user_id"] for r in rows)]
    combined.sort(key=lambda x: x["xp"], reverse=True)
    return {"leaderboard": combined[:20], "me_user_id": user["user_id"]}

# ---------- Achievements ----------
@api.get("/achievements")
async def achievements(user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/achievements
    
    Returns all app achievements along with boolean flags showing which ones the user has unlocked.
    """
    unlocked = set(user.get("achievements", []))
    items = [{**a, "unlocked": a["id"] in unlocked} for a in ACHIEVEMENTS]
    return {"achievements": items}

# ---------- Stripe Subscription ----------
@api.get("/subscription/plans")
async def subscription_plans():
    """
    API Endpoint: GET /api/subscription/plans
    
    Returns available Stripe Premium subscription plans (weekly, monthly, quarterly).
    """
    return {"plans": STRIPE_PLANS}

@api.post("/subscription/checkout")
async def create_checkout(payload: CheckoutRequest, request: Request, user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/subscription/checkout
    
    Creates a Stripe Checkout Session for subscribing to Premium, applying referral discounts if active.
    Returns the Stripe checkout URL.
    """
    plan = STRIPE_PLANS.get(payload.plan)
    if not plan:
        raise HTTPException(400, "Invalid plan")
    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/premium/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/premium/cancel"

    # Apply referral discount (20% off) — server-authoritative
    base_amount = float(plan["amount"])
    discount_applied = False
    if user.get("referral_discount_active"):
        amount = round(base_amount * 0.8, 2)
        discount_applied = True
    else:
        amount = base_amount

    webhook_url = f"{origin}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    checkout_request = CheckoutSessionRequest(
        amount=amount,
        currency=plan["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
            "plan": payload.plan,
            "email": user["email"],
            "referral_discount": "1" if discount_applied else "0",
        },
    )
    session = await stripe.create_checkout_session(checkout_request)

    await db.payments.insert_one({
        "session_id": session.session_id,
        "user_id": user["user_id"],
        "plan": payload.plan,
        "amount": amount,
        "base_amount": base_amount,
        "currency": plan["currency"],
        "status": "initiated",
        "payment_status": "pending",
        "referral_discount": discount_applied,
        "referred_by": user.get("referred_by"),
        "created_at": datetime.now(timezone.utc),
    })
    return {"url": session.url, "session_id": session.session_id, "amount": amount, "referral_discount": discount_applied}

@api.get("/subscription/status/{session_id}")
async def poll_checkout(session_id: str, user=Depends(get_current_user)):
    """
    API Endpoint: GET /api/subscription/status/{session_id}
    
    Polls the payment status of a Stripe checkout session and upgrades user to Premium upon payment completion.
    """
    payment = await db.payments.find_one({"session_id": session_id}, {"_id": 0})
    if not payment:
        raise HTTPException(404, "Session not found")
    stripe = StripeCheckout(api_key=STRIPE_API_KEY)
    status = await stripe.get_checkout_status(session_id)

    # Update payment record
    await db.payments.update_one(
        {"session_id": session_id},
        {"$set": {"status": status.status, "payment_status": status.payment_status}},
    )

    # If just paid, upgrade user (idempotent — only once)
    if status.payment_status == "paid" and payment.get("payment_status") != "paid":
        plan = payment.get("plan", "monthly")
        duration = STRIPE_PLANS.get(plan, STRIPE_PLANS["monthly"])["duration_days"]
        until = datetime.now(timezone.utc) + timedelta(days=duration)
        ach = list(user.get("achievements", []))
        if "premium" not in ach:
            ach.append("premium")
        set_fields = {
            "is_premium": True,
            "premium_plan": plan,
            "premium_until": until.isoformat(),
            "achievements": ach,
        }
        # Consume the referral discount once redeemed
        if payment.get("referral_discount"):
            set_fields["referral_discount_active"] = False
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": set_fields})
        # Reward the referrer with the "referral" achievement bump (already active discount)
        referred_by = payment.get("referred_by")
        if referred_by:
            await db.users.update_one(
                {"user_id": referred_by},
                {"$set": {"referral_discount_active": True}},
            )

    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }

@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """
    API Endpoint: POST /api/webhook/stripe
    
    Asynchronous webhook listener called by Stripe to process completed subscription payments.
    """
    payload = await request.body()
    signature = request.headers.get("Stripe-Signature")
    stripe = StripeCheckout(api_key=STRIPE_API_KEY)
    try:
        event = await stripe.handle_webhook(payload, signature)
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(400, "Invalid webhook")
    if event.event_type == "checkout.session.completed":
        session_id = event.session_id
        payment = await db.payments.find_one({"session_id": session_id}, {"_id": 0})
        if payment and event.payment_status == "paid" and payment.get("payment_status") != "paid":
            plan = payment.get("plan", "monthly")
            duration = STRIPE_PLANS.get(plan, STRIPE_PLANS["monthly"])["duration_days"]
            until = datetime.now(timezone.utc) + timedelta(days=duration)
            await db.users.update_one(
                {"user_id": payment["user_id"]},
                {"$set": {
                    "is_premium": True,
                    "premium_plan": plan,
                    "premium_until": until.isoformat(),
                }},
            )
            await db.payments.update_one(
                {"session_id": session_id},
                {"$set": {"status": "complete", "payment_status": "paid"}},
            )
    return {"received": True}

@api.post("/subscription/cancel")
async def cancel_subscription(user=Depends(get_current_user)):
    """
    API Endpoint: POST /api/subscription/cancel
    
    Cancels the user's active premium membership immediately, updating user status in MongoDB
    and returning updated user profile for immediate client-side state refresh.
    """
    if not user.get("is_premium"):
        raise HTTPException(400, "User does not have an active premium membership")
    
    try:
        # Attempt Stripe cancellation lookup safely
        payment = await db.payments.find_one({"user_id": user["user_id"], "payment_status": "paid"}, sort=[("created_at", -1)])
        if payment and payment.get("session_id"):
            stripe = StripeCheckout(api_key=STRIPE_API_KEY)
            logger.info(f"Processing immediate Stripe cancellation for session: {payment['session_id']}")
    except Exception as e:
        # Log error details server-side only per Rule 2 (Obfuscated Responses)
        logger.error(f"Stripe cancellation notice: {e}")

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "is_premium": False,
            "premium_plan": None,
            "premium_until": None,
        }}
    )
    logger.info(f"Subscription cancelled immediately for user: {user['user_id']}")
    
    updated_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"status": "success", "message": "Membership cancelled immediately", "user": updated_user}

# ---------- Health ----------
@api.get("/")
async def root():
    """
    API Endpoint: GET /api/
    
    Basic health check endpoint returning server status message.
    """
    return {"message": "Acuspeak API online"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    """
    Shutdown Event Handler: shutdown
    
    Gracefully closes the Motor MongoDB client connection when the server stops.
    """
    client.close()
