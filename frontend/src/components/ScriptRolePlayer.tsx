import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

import { GradientButton } from "@/src/components/ui";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

export type ScriptLine = {
  line_id: string;
  speaker: string;
  text: string;
  audio_url?: string;
};

const DAILY_AUDIO_ASSETS: Record<string, Record<string, number>> = {
  "daily-1": {
    "d1-l1": require("../../assets/audio/daily_english/intro/alex_L1.mp3"),
    "d1-l2": require("../../assets/audio/daily_english/intro/priya_L1.mp3"),
    "d1-l3": require("../../assets/audio/daily_english/intro/alex_L2.mp3"),
    "d1-l4": require("../../assets/audio/daily_english/intro/priya_L2.mp3"),
    "d1-l5": require("../../assets/audio/daily_english/intro/alex_L3.mp3"),
    "d1-l6": require("../../assets/audio/daily_english/intro/priya_L3.mp3"),
    "d1-l7": require("../../assets/audio/daily_english/intro/alex_L4.mp3"),
    "d1-l8": require("../../assets/audio/daily_english/intro/priya_L4.mp3"),
    "d1-l9": require("../../assets/audio/daily_english/intro/alex_L5.mp3"),
    "d1-l10": require("../../assets/audio/daily_english/intro/priya_L5.mp3"),
  },
  "daily-2": {
    "d2-l1": require("../../assets/audio/daily_english/ordering_at_cafe/Barista_L1.mp3"),
    "d2-l2": require("../../assets/audio/daily_english/ordering_at_cafe/Customer_L1.mp3"),
    "d2-l3": require("../../assets/audio/daily_english/ordering_at_cafe/Barista_L2.mp3"),
    "d2-l4": require("../../assets/audio/daily_english/ordering_at_cafe/Customer_L2.mp3"),
    "d2-l5": require("../../assets/audio/daily_english/ordering_at_cafe/Barista_L3.mp3"),
    "d2-l6": require("../../assets/audio/daily_english/ordering_at_cafe/Customer_L3.mp3"),
    "d2-l7": require("../../assets/audio/daily_english/ordering_at_cafe/Barista_L4.mp3"),
    "d2-l8": require("../../assets/audio/daily_english/ordering_at_cafe/Customer_L4.mp3"),
    "d2-l9": require("../../assets/audio/daily_english/ordering_at_cafe/Barista_L5.mp3"),
    "d2-l10": require("../../assets/audio/daily_english/ordering_at_cafe/Customer_L5.mp3"),
  },
  "daily-3": {
    "d3-l1": require("../../assets/audio/daily_english/casul_conversation/Aman_L1.mp3"),
    "d3-l2": require("../../assets/audio/daily_english/casul_conversation/Stranger_L1.mp3"),
    "d3-l3": require("../../assets/audio/daily_english/casul_conversation/Aman_L2.mp3"),
    "d3-l4": require("../../assets/audio/daily_english/casul_conversation/Stranger_L2.mp3"),
    "d3-l5": require("../../assets/audio/daily_english/casul_conversation/Aman_L3.mp3"),
    "d3-l6": require("../../assets/audio/daily_english/casul_conversation/Stranger_L3.mp3"),
    "d3-l7": require("../../assets/audio/daily_english/casul_conversation/Aman_L4.mp3"),
    "d3-l8": require("../../assets/audio/daily_english/casul_conversation/Stranger_L4.mp3"),
    "d3-l9": require("../../assets/audio/daily_english/casul_conversation/Aman_L5.mp3"),
    "d3-l10": require("../../assets/audio/daily_english/casul_conversation/Stranger_L5.mp3"),
  },
  "daily-4": {
    "d4-l1": require("../../assets/audio/daily_english/shopping_conversation/Assistant_L1.mp3"),
    "d4-l2": require("../../assets/audio/daily_english/shopping_conversation/Customer_L1.mp3"),
    "d4-l3": require("../../assets/audio/daily_english/shopping_conversation/Assistant_L2.mp3"),
    "d4-l4": require("../../assets/audio/daily_english/shopping_conversation/Customer_L2.mp3"),
    "d4-l5": require("../../assets/audio/daily_english/shopping_conversation/Assistant_L3.mp3"),
    "d4-l6": require("../../assets/audio/daily_english/shopping_conversation/Customer_L3.mp3"),
    "d4-l7": require("../../assets/audio/daily_english/shopping_conversation/Assistant_L4.mp3"),
    "d4-l8": require("../../assets/audio/daily_english/shopping_conversation/Customer_L4.mp3"),
    "d4-l9": require("../../assets/audio/daily_english/shopping_conversation/Assistant_L5.mp3"),
    "d4-l10": require("../../assets/audio/daily_english/shopping_conversation/Customer_L5.mp3"),
  },
  "daily-5": {
    "d5-l1": require("../../assets/audio/daily_english/asking_for_directions/Traveller_L1.mp3"),
    "d5-l2": require("../../assets/audio/daily_english/asking_for_directions/Resident_L1.mp3"),
    "d5-l3": require("../../assets/audio/daily_english/asking_for_directions/Traveller_L2.mp3"),
    "d5-l4": require("../../assets/audio/daily_english/asking_for_directions/Resident_L2.mp3"),
    "d5-l5": require("../../assets/audio/daily_english/asking_for_directions/Traveller_L3.mp3"),
    "d5-l6": require("../../assets/audio/daily_english/asking_for_directions/Resident_L3.mp3"),
    "d5-l7": require("../../assets/audio/daily_english/asking_for_directions/Traveller_L4.mp3"),
    "d5-l8": require("../../assets/audio/daily_english/asking_for_directions/Resident_L4.mp3"),
    "d5-l9": require("../../assets/audio/daily_english/asking_for_directions/Traveller_L5.mp3"),
  },
  "daily-6": {
    "d6-l1": require("../../assets/audio/daily_english/at_the_resturant/Waiter_L1.mp3"),
    "d6-l2": require("../../assets/audio/daily_english/at_the_resturant/Customer_L1.mp3"),
    "d6-l3": require("../../assets/audio/daily_english/at_the_resturant/Waiter_L2.mp3"),
    "d6-l4": require("../../assets/audio/daily_english/at_the_resturant/Customer_L2.mp3"),
    "d6-l5": require("../../assets/audio/daily_english/at_the_resturant/Waiter_L3.mp3"),
    "d6-l6": require("../../assets/audio/daily_english/at_the_resturant/Customer_L3.mp3"),
    "d6-l7": require("../../assets/audio/daily_english/at_the_resturant/Waiter_L4.mp3"),
    "d6-l8": require("../../assets/audio/daily_english/at_the_resturant/Customer_L4.mp3"),
    "d6-l9": require("../../assets/audio/daily_english/at_the_resturant/Waiter_L5.mp3"),
  },
  "daily-7": {
    "d7-l1": require("../../assets/audio/daily_english/talking_about_weekends/Pritam_L1.mp3"),
    "d7-l2": require("../../assets/audio/daily_english/talking_about_weekends/Priya_L1.mp3"),
    "d7-l3": require("../../assets/audio/daily_english/talking_about_weekends/Pritam_L2.mp3"),
    "d7-l4": require("../../assets/audio/daily_english/talking_about_weekends/Priya_L2.mp3"),
    "d7-l5": require("../../assets/audio/daily_english/talking_about_weekends/Pritam_L3.mp3"),
    "d7-l6": require("../../assets/audio/daily_english/talking_about_weekends/Priya_L3.mp3"),
    "d7-l7": require("../../assets/audio/daily_english/talking_about_weekends/Pritam_L4.mp3"),
    "d7-l8": require("../../assets/audio/daily_english/talking_about_weekends/Priya_L4.mp3"),
    "d7-l9": require("../../assets/audio/daily_english/talking_about_weekends/Pritam_L5.mp3"),
    "d7-l10": require("../../assets/audio/daily_english/talking_about_weekends/Priya_L5.mp3"),
  },
  "daily-8": {
    "d8-l1": require("../../assets/audio/daily_english/doctor_visit/Doctor_L1.mp3"),
    "d8-l2": require("../../assets/audio/daily_english/doctor_visit/Patient_L1.mp3"),
    "d8-l3": require("../../assets/audio/daily_english/doctor_visit/Doctor_L2.mp3"),
    "d8-l4": require("../../assets/audio/daily_english/doctor_visit/Patient_L2.mp3"),
    "d8-l5": require("../../assets/audio/daily_english/doctor_visit/Doctor_L3.mp3"),
    "d8-l6": require("../../assets/audio/daily_english/doctor_visit/Patient_L3.mp3"),
    "d8-l7": require("../../assets/audio/daily_english/doctor_visit/Doctor_L4.mp3"),
    "d8-l8": require("../../assets/audio/daily_english/doctor_visit/Patient_L4.mp3"),
    "d8-l9": require("../../assets/audio/daily_english/doctor_visit/Doctor_L5.mp3"),
    "d8-l10": require("../../assets/audio/daily_english/doctor_visit/Patient_L5.mp3"),
    "d8-l11": require("../../assets/audio/daily_english/doctor_visit/Doctor_L6.mp3"),
    "d8-l12": require("../../assets/audio/daily_english/doctor_visit/Patient_L6.mp3"),
  },
  "daily-9": {
    "d9-l1": require("../../assets/audio/daily_english/phone_conversation/Rohan_L1.mp3"),
    "d9-l2": require("../../assets/audio/daily_english/phone_conversation/Amit_L1.mp3"),
    "d9-l3": require("../../assets/audio/daily_english/phone_conversation/Rohan_L2.mp3"),
    "d9-l4": require("../../assets/audio/daily_english/phone_conversation/Amit_L2.mp3"),
    "d9-l5": require("../../assets/audio/daily_english/phone_conversation/Rohan_L3.mp3"),
    "d9-l6": require("../../assets/audio/daily_english/phone_conversation/Amit_L3.mp3"),
    "d9-l7": require("../../assets/audio/daily_english/phone_conversation/Rohan_L4.mp3"),
    "d9-l8": require("../../assets/audio/daily_english/phone_conversation/Amit_L4.mp3"),
    "d9-l9": require("../../assets/audio/daily_english/phone_conversation/Rohan_L5.mp3"),
    "d9-l10": require("../../assets/audio/daily_english/phone_conversation/Amit_L5.mp3"),
  },
  "daily-10": {
    "d10-l1": require("../../assets/audio/daily_english/opinions_on_a_new movie/Priya_L1.mp3"),
    "d10-l2": require("../../assets/audio/daily_english/opinions_on_a_new movie/Rohit_L1.mp3"),
    "d10-l3": require("../../assets/audio/daily_english/opinions_on_a_new movie/Priya_L2.mp3"),
    "d10-l4": require("../../assets/audio/daily_english/opinions_on_a_new movie/Rohit_L2.mp3"),
    "d10-l5": require("../../assets/audio/daily_english/opinions_on_a_new movie/Priya_L3.mp3"),
    "d10-l6": require("../../assets/audio/daily_english/opinions_on_a_new movie/Rohit_L3.mp3"),
    "d10-l7": require("../../assets/audio/daily_english/opinions_on_a_new movie/Priya_L4.mp3"),
    "d10-l8": require("../../assets/audio/daily_english/opinions_on_a_new movie/Rohit_L4.mp3"),
    "d10-l9": require("../../assets/audio/daily_english/opinions_on_a_new movie/Priya_L5.mp3"),
    "d10-l10": require("../../assets/audio/daily_english/opinions_on_a_new movie/Rohit_L5.mp3"),
  },
  "business-1": {
    "b1-l1": require("../../assets/audio/business_english/business_meeting/Manager_L1.mp3"),
    "b1-l2": require("../../assets/audio/business_english/business_meeting/Ravi_L1.mp3"),
    "b1-l3": require("../../assets/audio/business_english/business_meeting/Manager_L2.mp3"),
    "b1-l4": require("../../assets/audio/business_english/business_meeting/Sneha_L1.mp3"),
    "b1-l5": require("../../assets/audio/business_english/business_meeting/Manager_L3.mp3"),
    "b1-l6": require("../../assets/audio/business_english/business_meeting/Sneha_L2.mp3"),
    "b1-l7": require("../../assets/audio/business_english/business_meeting/Ravi_L2.mp3"),
    "b1-l8": require("../../assets/audio/business_english/business_meeting/Sneha_L3.mp3"),
    "b1-l9": require("../../assets/audio/business_english/business_meeting/Manager_L4.mp3"),
    "b1-l10": require("../../assets/audio/business_english/business_meeting/Ravi_L3.mp3"),
  },
  "business-2": {
    "b2-l1": require("../../assets/audio/business_english/Email_writing/Anita_L1.mp3"),
    "b2-l2": require("../../assets/audio/business_english/Email_writing/Vikram_L1.mp3"),
    "b2-l3": require("../../assets/audio/business_english/Email_writing/Anita_L2.mp3"),
    "b2-l4": require("../../assets/audio/business_english/Email_writing/Vikram_L2.mp3"),
    "b2-l5": require("../../assets/audio/business_english/Email_writing/Anita_L3.mp3"),
    "b2-l6": require("../../assets/audio/business_english/Email_writing/Vikram_L3.mp3"),
    "b2-l7": require("../../assets/audio/business_english/Email_writing/Anita_L4.mp3"),
    "b2-l8": require("../../assets/audio/business_english/Email_writing/Vikram_L4.mp3"),
    "b2-l9": require("../../assets/audio/business_english/Email_writing/Anita_L5.mp3"),
    "b2-l10": require("../../assets/audio/business_english/Email_writing/Vikram_L5.mp3"),
    "b2-l11": require("../../assets/audio/business_english/Email_writing/Anita_L6.mp3"),
    "b2-l12": require("../../assets/audio/business_english/Email_writing/Vikram_L6.mp3"),
  },
  "business-3": {
    "b3-l1": require("../../assets/audio/business_english/negotiation_deals/Buyer_L1.mp3"),
    "b3-l2": require("../../assets/audio/business_english/negotiation_deals/Seller_L1.mp3"),
    "b3-l3": require("../../assets/audio/business_english/negotiation_deals/Buyer_L2.mp3"),
    "b3-l4": require("../../assets/audio/business_english/negotiation_deals/Seller_L2.mp3"),
    "b3-l5": require("../../assets/audio/business_english/negotiation_deals/Buyer_L3.mp3"),
    "b3-l6": require("../../assets/audio/business_english/negotiation_deals/Seller_L3.mp3"),
    "b3-l7": require("../../assets/audio/business_english/negotiation_deals/Buyer_L4.mp3"),
    "b3-l8": require("../../assets/audio/business_english/negotiation_deals/Seller_L4.mp3"),
    "b3-l9": require("../../assets/audio/business_english/negotiation_deals/Buyer_L5.mp3"),
    "b3-l10": require("../../assets/audio/business_english/negotiation_deals/Seller_L5.mp3"),
  },
  "business-4": {
    "b4-l1": require("../../assets/audio/business_english/presentation/Presentor_L1.mp3"),
    "b4-l2": require("../../assets/audio/business_english/presentation/Presentor_L2.mp3"),
    "b4-l3": require("../../assets/audio/business_english/presentation/Presentor_L3.mp3"),
    "b4-l4": require("../../assets/audio/business_english/presentation/Audience_L1.mp3"),
    "b4-l5": require("../../assets/audio/business_english/presentation/Presentor_L4.mp3"),
    "b4-l6": require("../../assets/audio/business_english/presentation/Presentor_L5.mp3"),
    "b4-l7": require("../../assets/audio/business_english/presentation/Audience_L2.mp3"),
    "b4-l8": require("../../assets/audio/business_english/presentation/Presentor_L6.mp3"),
    "b4-l9": require("../../assets/audio/business_english/presentation/Audience_L3.mp3"),
    "b4-l10": require("../../assets/audio/business_english/presentation/Presentor_L7.mp3"),
  },
  "business-5": {
    "b5-l1": require("../../assets/audio/business_english/networking/Meera_L1.mp3"),
    "b5-l2": require("../../assets/audio/business_english/networking/Arjun_L1.mp3"),
    "b5-l3": require("../../assets/audio/business_english/networking/Meera_L2.mp3"),
    "b5-l4": require("../../assets/audio/business_english/networking/Arjun_L2.mp3"),
    "b5-l5": require("../../assets/audio/business_english/networking/Meera_L3.mp3"),
    "b5-l6": require("../../assets/audio/business_english/networking/Arjun_L3.mp3"),
    "b5-l7": require("../../assets/audio/business_english/networking/Meera_L4.mp3"),
    "b5-l8": require("../../assets/audio/business_english/networking/Arjun_L4.mp3"),
    "b5-l9": require("../../assets/audio/business_english/networking/Meera_L5.mp3"),
    "b5-l10": require("../../assets/audio/business_english/networking/Arjun_L5.mp3"),
  },
  "business-6": {
    "b6-l1": require("../../assets/audio/business_english/conflict_conversation/Manager_L1.mp3"),
    "b6-l2": require("../../assets/audio/business_english/conflict_conversation/Rahul_L1.mp3"),
    "b6-l3": require("../../assets/audio/business_english/conflict_conversation/Manager_L2.mp3"),
    "b6-l4": require("../../assets/audio/business_english/conflict_conversation/Rahul_L2.mp3"),
    "b6-l5": require("../../assets/audio/business_english/conflict_conversation/Manager_L3.mp3"),
    "b6-l6": require("../../assets/audio/business_english/conflict_conversation/Rahul_L3.mp3"),
    "b6-l7": require("../../assets/audio/business_english/conflict_conversation/Manager_L4.mp3"),
    "b6-l8": require("../../assets/audio/business_english/conflict_conversation/Rahul_L4.mp3"),
    "b6-l9": require("../../assets/audio/business_english/conflict_conversation/Manager_L5.mp3"),
    "b6-l10": require("../../assets/audio/business_english/conflict_conversation/Rahul_L5.mp3"),
  },
  "business-7": {
    "b7-l1": require("../../assets/audio/business_english/corporate_culture/Nisha_L1.mp3"),
    "b7-l2": require("../../assets/audio/business_english/corporate_culture/Karan_L1.mp3"),
    "b7-l3": require("../../assets/audio/business_english/corporate_culture/Nisha_L2.mp3"),
    "b7-l4": require("../../assets/audio/business_english/corporate_culture/Karan_L2.mp3"),
    "b7-l5": require("../../assets/audio/business_english/corporate_culture/Nisha_L3.mp3"),
    "b7-l6": require("../../assets/audio/business_english/corporate_culture/Karan_L3.mp3"),
    "b7-l7": require("../../assets/audio/business_english/corporate_culture/Nisha_L4.mp3"),
    "b7-l8": require("../../assets/audio/business_english/corporate_culture/Karan_L4.mp3"),
    "b7-l9": require("../../assets/audio/business_english/corporate_culture/Nisha_L5.mp3"),
    "b7-l10": require("../../assets/audio/business_english/corporate_culture/Karan_L5.mp3"),
  },
  "business-8": {
    "b8-l1": require("../../assets/audio/business_english/Remote_work/TL_L1.mp3"),
    "b8-l2": require("../../assets/audio/business_english/Remote_work/Divya_L1.mp3"),
    "b8-l3": require("../../assets/audio/business_english/Remote_work/Sameer_L1.mp3"),
    "b8-l4": require("../../assets/audio/business_english/Remote_work/TL_L2.mp3"),
    "b8-l5": require("../../assets/audio/business_english/Remote_work/Divya_L2.mp3"),
    "b8-l6": require("../../assets/audio/business_english/Remote_work/TL_L3.mp3"),
    "b8-l7": require("../../assets/audio/business_english/Remote_work/Sameer_L2.mp3"),
    "b8-l8": require("../../assets/audio/business_english/Remote_work/TL_L4.mp3"),
    "b8-l9": require("../../assets/audio/business_english/Remote_work/Divya_L3.mp3"),
    "b8-l10": require("../../assets/audio/business_english/Remote_work/TL_L5.mp3"),
  },
  "business-9": {
    "b9-l1": require("../../assets/audio/business_english/Sales/Salesman_L1.mp3"),
    "b9-l2": require("../../assets/audio/business_english/Sales/Client_L1.mp3"),
    "b9-l3": require("../../assets/audio/business_english/Sales/Salesman_L2.mp3"),
    "b9-l4": require("../../assets/audio/business_english/Sales/Client_L2.mp3"),
    "b9-l5": require("../../assets/audio/business_english/Sales/Salesman_L3.mp3"),
    "b9-l6": require("../../assets/audio/business_english/Sales/Client_L3.mp3"),
    "b9-l7": require("../../assets/audio/business_english/Sales/Salesman_L4.mp3"),
    "b9-l8": require("../../assets/audio/business_english/Sales/Client_L4.mp3"),
    "b9-l9": require("../../assets/audio/business_english/Sales/Salesman_L5.mp3"),
    "b9-l10": require("../../assets/audio/business_english/Sales/Client_L5.mp3"),
  },
  "business-10": {
    "b10-l1": require("../../assets/audio/business_english/Leadership/Leader_L1.mp3"),
    "b10-l2": require("../../assets/audio/business_english/Leadership/Pooja_L1.mp3"),
    "b10-l3": require("../../assets/audio/business_english/Leadership/Leader_L2.mp3"),
    "b10-l4": require("../../assets/audio/business_english/Leadership/Suresh_L1.mp3"),
    "b10-l5": require("../../assets/audio/business_english/Leadership/Leader_L3.mp3"),
    "b10-l6": require("../../assets/audio/business_english/Leadership/Pooja_L2.mp3"),
    "b10-l7": require("../../assets/audio/business_english/Leadership/Leader_L4.mp3"),
    "b10-l8": require("../../assets/audio/business_english/Leadership/Suresh_L2.mp3"),
    "b10-l9": require("../../assets/audio/business_english/Leadership/Leader_L5.mp3"),
    "b10-l10": require("../../assets/audio/business_english/Leadership/Pooja_L3.mp3"),
  },
  "interview-1": {
    "i1-l1": require("../../assets/audio/interview_english/Intro/Interviewer_L1.mp3"),
    "i1-l2": require("../../assets/audio/interview_english/Intro/Candidate_L1.mp3"),
    "i1-l3": require("../../assets/audio/interview_english/Intro/Candidate_L2.mp3"),
    "i1-l4": require("../../assets/audio/interview_english/Intro/Interviewer_L2.mp3"),
    "i1-l5": require("../../assets/audio/interview_english/Intro/Candidate_L3.mp3"),
    "i1-l6": require("../../assets/audio/interview_english/Intro/Interviewer_L3.mp3"),
    "i1-l7": require("../../assets/audio/interview_english/Intro/Candidate_L4.mp3"),
    "i1-l8": require("../../assets/audio/interview_english/Intro/Candidate_L5.mp3"),
    "i1-l9": require("../../assets/audio/interview_english/Intro/Interviewer_L4.mp3"),
    "i1-l10": require("../../assets/audio/interview_english/Intro/Candidate_L6.mp3"),
  },
  "interview-2": {
    "i2-l1": require("../../assets/audio/interview_english/Behavioural/Interviewer_L1.mp3"),
    "i2-l2": require("../../assets/audio/interview_english/Behavioural/Candidate_L1.mp3"),
    "i2-l3": require("../../assets/audio/interview_english/Behavioural/Interviewer_L2.mp3"),
    "i2-l4": require("../../assets/audio/interview_english/Behavioural/Candidate_L2.mp3"),
    "i2-l5": require("../../assets/audio/interview_english/Behavioural/Candidate_L3.mp3"),
    "i2-l6": require("../../assets/audio/interview_english/Behavioural/Interviewer_L3.mp3"),
    "i2-l7": require("../../assets/audio/interview_english/Behavioural/Candidate_L4.mp3"),
    "i2-l8": require("../../assets/audio/interview_english/Behavioural/Candidate_L5.mp3"),
    "i2-l9": require("../../assets/audio/interview_english/Behavioural/Interviewer_L4.mp3"),
    "i2-l10": require("../../assets/audio/interview_english/Behavioural/Candidate_L6.mp3"),
  },
  "interview-3": {
    "i3-l1": require("../../assets/audio/interview_english/Motivation/Interviewer_L1.mp3"),
    "i3-l2": require("../../assets/audio/interview_english/Motivation/Candidate_L1.mp3"),
    "i3-l3": require("../../assets/audio/interview_english/Motivation/Interviewer_L2.mp3"),
    "i3-l4": require("../../assets/audio/interview_english/Motivation/Candidate_L2.mp3"),
    "i3-l5": require("../../assets/audio/interview_english/Motivation/Interviewer_L3.mp3"),
    "i3-l6": require("../../assets/audio/interview_english/Motivation/Candidate_L3.mp3"),
    "i3-l7": require("../../assets/audio/interview_english/Motivation/Interviewer_L4.mp3"),
    "i3-l8": require("../../assets/audio/interview_english/Motivation/Candidate_L4.mp3"),
    "i3-l9": require("../../assets/audio/interview_english/Motivation/Interviewer_L5.mp3"),
    "i3-l10": require("../../assets/audio/interview_english/Motivation/Candidate_L5.mp3"),
  },
  "interview-4": {
    "i4-l1": require("../../assets/audio/interview_english/Strength/Interviewer_L1.mp3"),
    "i4-l2": require("../../assets/audio/interview_english/Strength/Candidate_L1.mp3"),
    "i4-l3": require("../../assets/audio/interview_english/Strength/Interviewer_L2.mp3"),
    "i4-l4": require("../../assets/audio/interview_english/Strength/Candidate_L2.mp3"),
    "i4-l5": require("../../assets/audio/interview_english/Strength/Candidate_L3.mp3"),
    "i4-l6": require("../../assets/audio/interview_english/Strength/Interviewer_L3.mp3"),
    "i4-l7": require("../../assets/audio/interview_english/Strength/Candidate_L4.mp3"),
    "i4-l8": require("../../assets/audio/interview_english/Strength/Interviewer_L4.mp3"),
    "i4-l9": require("../../assets/audio/interview_english/Strength/Candidate_L5.mp3"),
    "i4-l10": require("../../assets/audio/interview_english/Strength/Interviewer_L5.mp3"),
  },
  "interview-5": {
    "i5-l1": require("../../assets/audio/interview_english/Weakness/Interviewer_L1.mp3"),
    "i5-l2": require("../../assets/audio/interview_english/Weakness/Candidate_L1.mp3"),
    "i5-l3": require("../../assets/audio/interview_english/Weakness/Interviewer_L2.mp3"),
    "i5-l4": require("../../assets/audio/interview_english/Weakness/Candidate_L2.mp3"),
    "i5-l5": require("../../assets/audio/interview_english/Weakness/Interviewer_L3.mp3"),
    "i5-l6": require("../../assets/audio/interview_english/Weakness/Candidate_L3.mp3"),
    "i5-l7": require("../../assets/audio/interview_english/Weakness/Candidate_L4.mp3"),
    "i5-l8": require("../../assets/audio/interview_english/Weakness/Interviewer_L4.mp3"),
    "i5-l9": require("../../assets/audio/interview_english/Weakness/Candidate_L5.mp3"),
    "i5-l10": require("../../assets/audio/interview_english/Weakness/Interviewer_L5.mp3"),
  },
  "interview-6": {
    "i6-l1": require("../../assets/audio/interview_english/Technical/Interviewer_L1.mp3"),
    "i6-l2": require("../../assets/audio/interview_english/Technical/Candidate_L1.mp3"),
    "i6-l3": require("../../assets/audio/interview_english/Technical/Interviewer_L2.mp3"),
    "i6-l4": require("../../assets/audio/interview_english/Technical/Candidate_L2.mp3"),
    "i6-l5": require("../../assets/audio/interview_english/Technical/Interviewer_L3.mp3"),
    "i6-l6": require("../../assets/audio/interview_english/Technical/Candidate_L3.mp3"),
    "i6-l7": require("../../assets/audio/interview_english/Technical/Interviewer_L4.mp3"),
    "i6-l8": require("../../assets/audio/interview_english/Technical/Candidate_L4.mp3"),
    "i6-l9": require("../../assets/audio/interview_english/Technical/Interviewer_L5.mp3"),
    "i6-l10": require("../../assets/audio/interview_english/Technical/Candidate_L5.mp3"),
  },
  "interview-7": {
    "i7-l1": require("../../assets/audio/interview_english/Salary/Interviewer_L1.mp3"),
    "i7-l2": require("../../assets/audio/interview_english/Salary/Candidate_L1.mp3"),
    "i7-l3": require("../../assets/audio/interview_english/Salary/Interviewer_L2.mp3"),
    "i7-l4": require("../../assets/audio/interview_english/Salary/Candidate_L2.mp3"),
    "i7-l5": require("../../assets/audio/interview_english/Salary/Interviewer_L3.mp3"),
    "i7-l6": require("../../assets/audio/interview_english/Salary/Candidate_L3.mp3"),
    "i7-l7": require("../../assets/audio/interview_english/Salary/Interviewer_L4.mp3"),
    "i7-l8": require("../../assets/audio/interview_english/Salary/Candidate_L4.mp3"),
    "i7-l9": require("../../assets/audio/interview_english/Salary/Interviewer_L5.mp3"),
    "i7-l10": require("../../assets/audio/interview_english/Salary/Candidate_L5.mp3"),
  },
  "interview-8": {
    "i8-l1": require("../../assets/audio/interview_english/Question/Interviewer_L1.mp3"),
    "i8-l2": require("../../assets/audio/interview_english/Question/Candidate_L1.mp3"),
    "i8-l3": require("../../assets/audio/interview_english/Question/Interviewer_L2.mp3"),
    "i8-l4": require("../../assets/audio/interview_english/Question/Candidate_L2.mp3"),
    "i8-l5": require("../../assets/audio/interview_english/Question/Interviewer_L3.mp3"),
    "i8-l6": require("../../assets/audio/interview_english/Question/Candidate_L3.mp3"),
    "i8-l7": require("../../assets/audio/interview_english/Question/Interviewer_L4.mp3"),
    "i8-l8": require("../../assets/audio/interview_english/Question/Candidate_L4.mp3"),
    "i8-l9": require("../../assets/audio/interview_english/Question/Interviewer_L5.mp3"),
    "i8-l10": require("../../assets/audio/interview_english/Question/Candidate_L5.mp3"),
  },
  "interview-9": {
    "i9-l1": require("../../assets/audio/interview_english/Difficulties/Interviewer_L1.mp3"),
    "i9-l2": require("../../assets/audio/interview_english/Difficulties/Candidate_L1.mp3"),
    "i9-l3": require("../../assets/audio/interview_english/Difficulties/Interviewer_L2.mp3"),
    "i9-l4": require("../../assets/audio/interview_english/Difficulties/Candidate_L2.mp3"),
    "i9-l5": require("../../assets/audio/interview_english/Difficulties/Candidate_L3.mp3"),
    "i9-l6": require("../../assets/audio/interview_english/Difficulties/Interviewer_L3.mp3"),
    "i9-l7": require("../../assets/audio/interview_english/Difficulties/Candidate_L4.mp3"),
    "i9-l8": require("../../assets/audio/interview_english/Difficulties/Interviewer_L4.mp3"),
    "i9-l9": require("../../assets/audio/interview_english/Difficulties/Candidate_L5.mp3"),
    "i9-l10": require("../../assets/audio/interview_english/Difficulties/Interviewer_L5.mp3"),
  },
  "interview-10": {
    "i10-l1": require("../../assets/audio/interview_english/Closing/Interviewer_L1.mp3"),
    "i10-l2": require("../../assets/audio/interview_english/Closing/Candidate_L1.mp3"),
    "i10-l3": require("../../assets/audio/interview_english/Closing/Interviewer_L2.mp3"),
    "i10-l4": require("../../assets/audio/interview_english/Closing/Candidate_L2.mp3"),
    "i10-l5": require("../../assets/audio/interview_english/Closing/Interviewer_L3.mp3"),
    "i10-l6": require("../../assets/audio/interview_english/Closing/Candidate_L3.mp3"),
    "i10-l7": require("../../assets/audio/interview_english/Closing/Interviewer_L4.mp3"),
    "i10-l8": require("../../assets/audio/interview_english/Closing/Candidate_L4.mp3"),
    "i10-l9": require("../../assets/audio/interview_english/Closing/Interviewer_L5.mp3"),
    "i10-l10": require("../../assets/audio/interview_english/Closing/Candidate_L5.mp3"),
  },
  "travel-1": {
    "t1-l1": require("../../assets/audio/travel_english/Airport/Passenger_L1.mp3"),
    "t1-l2": require("../../assets/audio/travel_english/Airport/Staff_L1.mp3"),
    "t1-l3": require("../../assets/audio/travel_english/Airport/Passenger_L2.mp3"),
    "t1-l4": require("../../assets/audio/travel_english/Airport/Staff_L2.mp3"),
    "t1-l5": require("../../assets/audio/travel_english/Airport/Passenger_L3.mp3"),
    "t1-l6": require("../../assets/audio/travel_english/Airport/Staff_L3.mp3"),
    "t1-l7": require("../../assets/audio/travel_english/Airport/Passenger_L4.mp3"),
    "t1-l8": require("../../assets/audio/travel_english/Airport/Staff_L4.mp3"),
    "t1-l9": require("../../assets/audio/travel_english/Airport/Passenger_L5.mp3"),
    "t1-l10": require("../../assets/audio/travel_english/Airport/Staff_L5.mp3"),
  },
  "travel-2": {
    "t2-l1": require("../../assets/audio/travel_english/Hotel/Recep_L1.mp3"),
    "t2-l2": require("../../assets/audio/travel_english/Hotel/Traveler_L1.mp3"),
    "t2-l3": require("../../assets/audio/travel_english/Hotel/Recep_L2.mp3"),
    "t2-l4": require("../../assets/audio/travel_english/Hotel/Traveler_L2.mp3"),
    "t2-l5": require("../../assets/audio/travel_english/Hotel/Recep_L3.mp3"),
    "t2-l6": require("../../assets/audio/travel_english/Hotel/Traveler_L3.mp3"),
    "t2-l7": require("../../assets/audio/travel_english/Hotel/Recep_L4.mp3"),
    "t2-l8": require("../../assets/audio/travel_english/Hotel/Traveler_L4.mp3"),
    "t2-l9": require("../../assets/audio/travel_english/Hotel/Recep_L5.mp3"),
    "t2-l10": require("../../assets/audio/travel_english/Hotel/Traveler_L5.mp3"),
  },
  "travel-3": {
    "t3-l1": require("../../assets/audio/travel_english/Resturant/Waiteress_L1.mp3"),
    "t3-l2": require("../../assets/audio/travel_english/Resturant/Traveler_L1.mp3"),
    "t3-l3": require("../../assets/audio/travel_english/Resturant/Waiteress_L2.mp3"),
    "t3-l4": require("../../assets/audio/travel_english/Resturant/Traveler_L2.mp3"),
    "t3-l5": require("../../assets/audio/travel_english/Resturant/Waiteress_L3.mp3"),
    "t3-l6": require("../../assets/audio/travel_english/Resturant/Traveler_L3.mp3"),
    "t3-l7": require("../../assets/audio/travel_english/Resturant/Waiteress_L4.mp3"),
    "t3-l8": require("../../assets/audio/travel_english/Resturant/Traveler_L4.mp3"),
    "t3-l9": require("../../assets/audio/travel_english/Resturant/Waiteress_L5.mp3"),
    "t3-l10": require("../../assets/audio/travel_english/Resturant/Traveler_L5.mp3"),
  },
  "travel-4": {
    "t4-l1": require("../../assets/audio/travel_english/Transport/Traveler_L1.mp3"),
    "t4-l2": require("../../assets/audio/travel_english/Transport/Local_L1.mp3"),
    "t4-l3": require("../../assets/audio/travel_english/Transport/Traveler_L2.mp3"),
    "t4-l4": require("../../assets/audio/travel_english/Transport/Local_L2.mp3"),
    "t4-l5": require("../../assets/audio/travel_english/Transport/Traveler_L3.mp3"),
    "t4-l6": require("../../assets/audio/travel_english/Transport/Local_L3.mp3"),
    "t4-l7": require("../../assets/audio/travel_english/Transport/Traveler_L4.mp3"),
    "t4-l8": require("../../assets/audio/travel_english/Transport/Local_L4.mp3"),
    "t4-l9": require("../../assets/audio/travel_english/Transport/Traveler_L5.mp3"),
    "t4-l10": require("../../assets/audio/travel_english/Transport/Local_L5.mp3"),
  },
  "travel-5": {
    "t5-l1": require("../../assets/audio/travel_english/Directions/Traveler_L1.mp3"),
    "t5-l2": require("../../assets/audio/travel_english/Directions/Local_L1.mp3"),
    "t5-l3": require("../../assets/audio/travel_english/Directions/Traveler_L2.mp3"),
    "t5-l4": require("../../assets/audio/travel_english/Directions/Local_L2.mp3"),
    "t5-l5": require("../../assets/audio/travel_english/Directions/Traveler_L3.mp3"),
    "t5-l6": require("../../assets/audio/travel_english/Directions/Local_L3.mp3"),
    "t5-l7": require("../../assets/audio/travel_english/Directions/Traveler_L4.mp3"),
    "t5-l8": require("../../assets/audio/travel_english/Directions/Local_L4.mp3"),
    "t5-l9": require("../../assets/audio/travel_english/Directions/Traveler_L5.mp3"),
    "t5-l10": require("../../assets/audio/travel_english/Directions/Local_L5.mp3"),
  },
  "travel-6": {
    "t6-l1": require("../../assets/audio/travel_english/Shopping/Traveler_L1.mp3"),
    "t6-l2": require("../../assets/audio/travel_english/Shopping/Vendor_L1.mp3"),
    "t6-l3": require("../../assets/audio/travel_english/Shopping/Traveler_L2.mp3"),
    "t6-l4": require("../../assets/audio/travel_english/Shopping/Vendor_L2.mp3"),
    "t6-l5": require("../../assets/audio/travel_english/Shopping/Traveler_L3.mp3"),
    "t6-l6": require("../../assets/audio/travel_english/Shopping/Vendor_L3.mp3"),
    "t6-l7": require("../../assets/audio/travel_english/Shopping/Traveler_L4.mp3"),
    "t6-l8": require("../../assets/audio/travel_english/Shopping/Vendor_L4.mp3"),
    "t6-l9": require("../../assets/audio/travel_english/Shopping/Traveler_L5.mp3"),
    "t6-l10": require("../../assets/audio/travel_english/Shopping/Vendor_L5.mp3"),
  },
  "travel-7": {
    "t7-l1": require("../../assets/audio/travel_english/Emergency/Traveler_L1.mp3"),
    "t7-l2": require("../../assets/audio/travel_english/Emergency/Bystander_L1.mp3"),
    "t7-l3": require("../../assets/audio/travel_english/Emergency/Traveler_L2.mp3"),
    "t7-l4": require("../../assets/audio/travel_english/Emergency/Bystander_L2.mp3"),
    "t7-l5": require("../../assets/audio/travel_english/Emergency/Traveler_L3.mp3"),
    "t7-l6": require("../../assets/audio/travel_english/Emergency/Bystander_L3.mp3"),
    "t7-l7": require("../../assets/audio/travel_english/Emergency/Traveler_L4.mp3"),
    "t7-l8": require("../../assets/audio/travel_english/Emergency/Bystander_L4.mp3"),
    "t7-l9": require("../../assets/audio/travel_english/Emergency/Traveler_L5.mp3"),
    "t7-l10": require("../../assets/audio/travel_english/Emergency/Bystander_L5.mp3"),
  },
  "travel-8": {
    "t8-l1": require("../../assets/audio/travel_english/Etiquette/Guide_L1.mp3"),
    "t8-l2": require("../../assets/audio/travel_english/Etiquette/Traveler_L1.mp3"),
    "t8-l3": require("../../assets/audio/travel_english/Etiquette/Guide_L2.mp3"),
    "t8-l4": require("../../assets/audio/travel_english/Etiquette/Traveler_L2.mp3"),
    "t8-l5": require("../../assets/audio/travel_english/Etiquette/Guide_L3.mp3"),
    "t8-l6": require("../../assets/audio/travel_english/Etiquette/Traveler_L3.mp3"),
    "t8-l7": require("../../assets/audio/travel_english/Etiquette/Guide_L4.mp3"),
    "t8-l8": require("../../assets/audio/travel_english/Etiquette/Traveler_L4.mp3"),
    "t8-l9": require("../../assets/audio/travel_english/Etiquette/Guide_L5.mp3"),
    "t8-l10": require("../../assets/audio/travel_english/Etiquette/Traveler_L5.mp3"),
  },
  "travel-9": {
    "t9-l1": require("../../assets/audio/travel_english/Planing/Traveler_L1.mp3"),
    "t9-l2": require("../../assets/audio/travel_english/Planing/Agent_L1.mp3"),
    "t9-l3": require("../../assets/audio/travel_english/Planing/Traveler_L2.mp3"),
    "t9-l4": require("../../assets/audio/travel_english/Planing/Agent_L2.mp3"),
    "t9-l5": require("../../assets/audio/travel_english/Planing/Traveler_L3.mp3"),
    "t9-l6": require("../../assets/audio/travel_english/Planing/Agent_L3.mp3"),
    "t9-l7": require("../../assets/audio/travel_english/Planing/Traveler_L4.mp3"),
    "t9-l8": require("../../assets/audio/travel_english/Planing/Agent_L4.mp3"),
    "t9-l9": require("../../assets/audio/travel_english/Planing/Traveler_L5.mp3"),
    "t9-l10": require("../../assets/audio/travel_english/Planing/Agent_L5.mp3"),
  },
  "travel-10": {
    "t10-l1": require("../../assets/audio/travel_english/Problems/Traveler_L1.mp3"),
    "t10-l2": require("../../assets/audio/travel_english/Problems/Staff_L1.mp3"),
    "t10-l3": require("../../assets/audio/travel_english/Problems/Traveler_L2.mp3"),
    "t10-l4": require("../../assets/audio/travel_english/Problems/Staff_L2.mp3"),
    "t10-l5": require("../../assets/audio/travel_english/Problems/Traveler_L3.mp3"),
    "t10-l6": require("../../assets/audio/travel_english/Problems/Staff_L3.mp3"),
    "t10-l7": require("../../assets/audio/travel_english/Problems/Traveler_L4.mp3"),
    "t10-l8": require("../../assets/audio/travel_english/Problems/Staff_L4.mp3"),
    "t10-l9": require("../../assets/audio/travel_english/Problems/Traveler_L5.mp3"),
    "t10-l10": require("../../assets/audio/travel_english/Problems/Staff_L5.mp3"),
  },
};

/**
 * Helper Function: getAudioSource
 * 
 * Returns the audio file source for a specific line in a lesson.
 * 1. Checks if the line has a bundled local audio file in DAILY_AUDIO_ASSETS.
 * 2. If not found in static assets, falls back to line.audio_url.
 * 3. Returns null if no audio is available.
 */
const getAudioSource = (lessonId: string, line: ScriptLine) => {
  return DAILY_AUDIO_ASSETS[lessonId]?.[line.line_id] ?? line.audio_url ?? null;
};

type ScriptRolePlayerProps = {
  script: ScriptLine[];
  lessonId: string;
  onBack?: () => void;
  onComplete?: () => void;
};

/**
 * Component: ScriptRolePlayer
 * 
 * An interactive conversation practice player component that allows users to:
 * - "Listen Mode": Auto-play the entire conversation script from start to finish.
 * - "Practice Mode": Pick a character role and roleplay turn-by-turn with timed responses.
 */
export function ScriptRolePlayer({ script, lessonId, onBack, onComplete }: ScriptRolePlayerProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "listening" | "role-select" | "practicing" | "complete">("idle");
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [countdownProgress, setCountdownProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<any>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveFailuresRef = useRef<number>(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lineOffsetsRef = useRef<{ [key: number]: number }>({});
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const uniqueRoles = useMemo(() => Array.from(new Set(script.map((line) => line.speaker))), [script]);
  const currentLine = script[currentLineIndex];
  const isUserTurn = selectedRole !== null && currentLine?.speaker === selectedRole;

  /**
   * Helper Function: cleanupPlayer
   * Safely stops, removes listeners, and releases memory for the Expo Audio player object.
   */
  const cleanupPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {
        // ignore pause failure
      }
      try {
        playerRef.current.remove();
      } catch {
        // ignore cleanup failures
      }
      try {
        playerRef.current.release();
      } catch {
        // ignore release failure
      }
      playerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  /**
   * Helper Function: cleanupCountdown
   * Stops the active turn timer interval and resets the progress bar state to zero.
   */
  const cleanupCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdownProgress(0);
  }, []);

  /**
   * Helper Function: setupAudioMode
   * Configures Expo audio system settings so audio plays properly even if the phone is in silent mode.
   */
  const setupAudioMode = useCallback(async () => {
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
      });
    } catch (audioModeError) {
      console.error("Audio mode setup failed", audioModeError);
    }
  }, []);

  /**
   * Helper Function: goToNextLine
   * Advances the conversation to the next script line.
   * If the last line is reached, it either marks the lesson complete or resets to idle.
   */
  const goToNextLine = useCallback(() => {
    cleanupPlayer();
    cleanupCountdown();
    setCurrentLineIndex((index) => {
      if (index >= script.length - 1) {
        if (modeRef.current === "practicing") {
          setMode("complete");
          if (onComplete) {
            onComplete();
          }
        } else {
          setMode("idle");
          setCurrentLineIndex(0);
        }
        return index;
      }
      return index + 1;
    });
  }, [cleanupCountdown, cleanupPlayer, onComplete, script.length]);

  /**
   * Event Handler: stopPractice
   * Immediately stops audio playback, clears timers, and resets the player UI to idle state.
   */
  const stopPractice = useCallback(() => {
    cleanupPlayer();
    cleanupCountdown();
    setMode("idle");
    setSelectedRole(null);
    setCurrentLineIndex(0);
    setError(null);
    consecutiveFailuresRef.current = 0;
  }, [cleanupCountdown, cleanupPlayer]);

  /**
   * Helper Function: maybePlayLine
   * Plays the audio file for the current script line using Expo Audio player.
   * Handles error retries and automatically moves to the next line when finished.
   */
  const maybePlayLine = useCallback(async () => {
    try {
      cleanupPlayer();
      cleanupCountdown();
      setError(null);

      if (!currentLine) {
        goToNextLine();
        return;
      }

      const source = getAudioSource(lessonId, currentLine);
      if (!source) {
        console.warn(`Missing audio for line_id=${currentLine.line_id}`);
        goToNextLine();
        return;
      }

      await setupAudioMode();

      console.log("Playing audio source", source, "line_id=", currentLine.line_id);
      const player = createAudioPlayer(source, {
        updateInterval: 200,
        keepAudioSessionActive: false,
        downloadFirst: true,
      });
      playerRef.current = player;
      setIsPlaying(true);
      player.addListener("playbackStatusUpdate", (status: any) => {
        console.log("Audio status update", status, "line_id=", currentLine.line_id);
        if (status.error) {
          console.error("Audio status error", status.error, "line_id=", currentLine.line_id);
        }
        if (status.didJustFinish) {
          consecutiveFailuresRef.current = 0;
          goToNextLine();
        }
      });
      player.play();
      consecutiveFailuresRef.current = 0;
    } catch (playError: any) {
      console.error("Audio playback failed:", playError, "line_id=", currentLine?.line_id);
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 3) {
        setError(`Audio playback error: ${playError?.message || "Failed to initialize player"}`);
        cleanupPlayer();
        cleanupCountdown();
        setIsPlaying(false);
      } else {
        goToNextLine();
      }
    }
  }, [cleanupCountdown, cleanupPlayer, currentLine, goToNextLine, lessonId, setupAudioMode]);

  /**
   * Helper Function: startCountdown
   * Starts a 4-second timer when it is the user's turn to speak.
   * Updates the progress bar and automatically advances to the next line when time expires.
   */
  const startCountdown = useCallback(() => {
    cleanupCountdown();
    setCountdownProgress(0);

    const start = Date.now();
    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / 4000);
      setCountdownProgress(progress);

      if (progress >= 1) {
        cleanupCountdown();
        goToNextLine();
      }
    }, 100);
  }, [cleanupCountdown, goToNextLine]);

  useEffect(() => {
    if (mode === "listening") {
      maybePlayLine();
      return;
    }

    if (mode === "practicing") {
      if (isUserTurn) {
        startCountdown();
      } else {
        maybePlayLine();
      }
    }
  }, [currentLineIndex, isUserTurn, mode, maybePlayLine, startCountdown]);

  useEffect(() => {
    if (mode === "listening" || mode === "practicing") {
      const y = lineOffsetsRef.current[currentLineIndex];
      if (typeof y === "number" && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: Math.max(0, y - 20), animated: true });
      }
    }
  }, [currentLineIndex, mode]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        cleanupPlayer();
        cleanupCountdown();
      }
    });

    return () => {
      cleanupPlayer();
      cleanupCountdown();
      subscription.remove();
    };
  }, [cleanupCountdown, cleanupPlayer]);

  /**
   * Event Handler: handleListenPress
   * Starts "Listen Mode" from line 0, playing all character lines sequentially.
   */
  const handleListenPress = () => {
    setSelectedRole(null);
    setCurrentLineIndex(0);
    setMode("listening");
  };

  /**
   * Event Handler: handlePracticePress
   * Opens the role selection menu so the user can choose which character to practice.
   */
  const handlePracticePress = () => {
    setCurrentLineIndex(0);
    setSelectedRole(null);
    setMode("role-select");
  };

  /**
   * Event Handler: handleRoleSelect
   * Sets the user's chosen character role and starts interactive practice from line 0.
   */
  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    setCurrentLineIndex(0);
    setMode("practicing");
  };

  /**
   * Event Handler: handleContinue
   * Manually advances to the next turn when the user finishes speaking during practice.
   */
  const handleContinue = () => {
    cleanupCountdown();
    goToNextLine();
  };

  /**
   * Event Handler: handleRestart
   * Resets the script player to the role selection screen so the user can practice again.
   */
  const handleRestart = () => {
    cleanupPlayer();
    cleanupCountdown();
    setMode("role-select");
    setSelectedRole(null);
    setCurrentLineIndex(0);
    setError(null);
  };

  /**
   * Event Handler: handleBackToLesson
   * Exits the script player UI and navigates back to the parent lesson page or category list.
   */
  const handleBackToLesson = () => {
    cleanupPlayer();
    cleanupCountdown();
    setMode("idle");
    setSelectedRole(null);
    setCurrentLineIndex(0);
    setError(null);
    if (onBack) {
      onBack();
    } else {
      const catId =
        typeof lessonId === "string" && lessonId.startsWith("biz")
          ? "business"
          : typeof lessonId === "string" && lessonId.startsWith("int")
          ? "interview"
          : typeof lessonId === "string" && lessonId.startsWith("trv")
          ? "travel"
          : typeof lessonId === "string" && lessonId.includes("-")
          ? lessonId.split("-")[0]
          : "daily";
      router.replace({ pathname: "/lessons/[categoryId]", params: { categoryId: catId } });
    }
  };

  const roleSelectionVisible = mode === "role-select";
  const showStop = (mode === "listening" || mode === "practicing") && isPlaying;
  const showContinue = mode === "practicing" && isUserTurn && !isPlaying;

  return (
    <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>Script Practice</Text>
          <Text style={styles.subTitle}>Listen, choose a role, and practice the convo.</Text>
        </View>
        {showStop ? (
          <GradientButton
            label="Stop"
            onPress={stopPractice}
            testID="script-stop-btn"
            style={styles.stopButton}
          />
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <GradientButton label="Listen" onPress={handleListenPress} testID="script-listen-btn" style={styles.wideButton} />
        <GradientButton label="Practice" onPress={handlePracticePress} testID="script-practice-btn" style={styles.wideButton} />
      </View>

      {roleSelectionVisible ? (
        <View style={styles.roleCardGrid}>
          <Text style={styles.roleTitle}>Choose your role</Text>
          {uniqueRoles.map((role) => {
            const active = selectedRole === role;
            return (
              <TouchableOpacity
                key={role}
                activeOpacity={0.85}
                style={[styles.roleCard, active && styles.roleCardActive]}
                onPress={() => handleRoleSelect(role)}
                testID="script-role-option"
              >
                <Text style={[styles.roleCardText, active && styles.roleCardTextActive]}>{role}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <ScrollView
        ref={scrollViewRef}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={true}
        style={styles.scriptScroll}
        contentContainerStyle={{ paddingBottom: 6 }}
      >
        {script.map((line, index) => {
          const active = index === currentLineIndex && (mode === "listening" || mode === "practicing");
          const isUserLine = selectedRole !== null && line.speaker === selectedRole;
          const lineBorderColor = active ? (isUserLine ? colors.gold : colors.primaryLight) : colors.divider;

          return (
            <View
              key={line.line_id}
              onLayout={(e) => {
                lineOffsetsRef.current[index] = e.nativeEvent.layout.y;
              }}
              style={[styles.lineCard, { borderColor: lineBorderColor }, active && styles.activeLineCard]}
            >
              <View style={styles.lineHeader}>
                <Text style={styles.lineSpeaker}>{line.speaker}</Text>
                <Text style={styles.lineLabel}>{`Line ${index + 1}`}</Text>
              </View>
              <Text style={styles.lineText}>{line.text}</Text>
              {active && mode === "practicing" && isUserLine ? (
                <View style={styles.userTurnRow}>
                  <Text style={styles.userTurnText}>Your turn — tap to continue</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {showContinue ? (
        <View style={styles.controlRow}>
          <View style={styles.countdownBarBackground}>
            <View style={[styles.countdownBarFill, { width: `${Math.round(countdownProgress * 100)}%` }]} />
          </View>
          <GradientButton
            label="Continue"
            onPress={handleContinue}
            testID="script-continue-btn"
            style={styles.continueButton}
          />
        </View>
      ) : null}

      {mode === "complete" ? (
        <View style={styles.completeCard}>
          <Text style={styles.completeTitle}>Practice Complete</Text>
          <Text style={styles.completeSubtitle}>Great work! You finished the script.</Text>
          <View style={styles.completeActions}>
            <GradientButton label="Restart" onPress={handleRestart} testID="script-restart-btn" style={styles.wideButton} />
            <GradientButton label="Back to Lessons List" onPress={handleBackToLesson} testID="script-back-to-lessons-btn" style={styles.wideButton} />
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.l,
    padding: spacing.m,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.m,
    marginBottom: spacing.m,
  },
  sectionTitle: {
    ...typography.h3,
  },
  subTitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.s,
    marginBottom: spacing.m,
  },
  wideButton: {
    flex: 1,
  },
  stopButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
  },
  roleCardGrid: {
    marginBottom: spacing.m,
    gap: spacing.s,
  },
  roleTitle: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.s,
  },
  roleCard: {
    backgroundColor: colors.chipBg,
    borderRadius: radii.lg,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    borderWidth: 1,
    borderColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  roleCardActive: {
    backgroundColor: colors.chipActive,
    borderColor: colors.primaryLight,
  },
  roleCardText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  roleCardTextActive: {
    color: colors.surface,
  },
  scriptScroll: {
    maxHeight: 420,
    marginBottom: spacing.m,
  },
  lineCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.m,
    marginBottom: spacing.s,
    backgroundColor: colors.surface,
  },
  activeLineCard: {
    ...shadow.strong,
    transform: [{ scale: 1.01 }],
  },
  lineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.s,
  },
  lineSpeaker: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  lineLabel: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  lineText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  userTurnRow: {
    marginTop: spacing.s,
    padding: spacing.s,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radii.md,
    backgroundColor: colors.chipBg,
  },
  userTurnText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  controlRow: {
    gap: spacing.s,
  },
  countdownBarBackground: {
    height: 8,
    backgroundColor: colors.divider,
    borderRadius: radii.pill,
    overflow: "hidden",
    marginBottom: spacing.s,
  },
  countdownBarFill: {
    height: "100%",
    backgroundColor: colors.primaryLight,
  },
  continueButton: {
    width: "100%",
  },
  completeCard: {
    marginTop: spacing.l,
    padding: spacing.m,
    borderRadius: radii.lg,
    backgroundColor: colors.chipBg,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  completeTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  completeSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.m,
  },
  completeActions: {
    flexDirection: "row",
    gap: spacing.s,
  },
  errorRow: {
    marginTop: spacing.s,
    padding: spacing.s,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.flame,
  },
  errorText: {
    ...typography.small,
    color: colors.flame,
  },
});
