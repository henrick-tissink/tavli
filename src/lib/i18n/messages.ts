import { type Locale, DEFAULT_LOCALE, isLocale } from "./locale";

import roUi from "@/messages/ro/ui.json";
import enUi from "@/messages/en/ui.json";
import deUi from "@/messages/de/ui.json";

import roCommon from "@/messages/ro/common.json";
import enCommon from "@/messages/en/common.json";
import deCommon from "@/messages/de/common.json";

import roDiscovery from "@/messages/ro/discovery.json";
import enDiscovery from "@/messages/en/discovery.json";
import deDiscovery from "@/messages/de/discovery.json";

import roRestaurant from "@/messages/ro/restaurant.json";
import enRestaurant from "@/messages/en/restaurant.json";
import deRestaurant from "@/messages/de/restaurant.json";

import roMenu from "@/messages/ro/menu.json";
import enMenu from "@/messages/en/menu.json";
import deMenu from "@/messages/de/menu.json";

import roBooking from "@/messages/ro/booking.json";
import enBooking from "@/messages/en/booking.json";
import deBooking from "@/messages/de/booking.json";

import roReviews from "@/messages/ro/reviews.json";
import enReviews from "@/messages/en/reviews.json";
import deReviews from "@/messages/de/reviews.json";

import roEvents from "@/messages/ro/events.json";
import enEvents from "@/messages/en/events.json";
import deEvents from "@/messages/de/events.json";

import roMeetingSpaces from "@/messages/ro/meetingSpaces.json";
import enMeetingSpaces from "@/messages/en/meetingSpaces.json";
import deMeetingSpaces from "@/messages/de/meetingSpaces.json";

import roProfile from "@/messages/ro/profile.json";
import enProfile from "@/messages/en/profile.json";
import deProfile from "@/messages/de/profile.json";

import roEmails from "@/messages/ro/emails.json";
import enEmails from "@/messages/en/emails.json";
import deEmails from "@/messages/de/emails.json";

import roPartnerCommon from "@/messages/ro/partner.common.json";
import enPartnerCommon from "@/messages/en/partner.common.json";
import dePartnerCommon from "@/messages/de/partner.common.json";

import roAdminCommon from "@/messages/ro/admin.common.json";
import enAdminCommon from "@/messages/en/admin.common.json";
import deAdminCommon from "@/messages/de/admin.common.json";
import roAdminDashboard from "@/messages/ro/admin.dashboard.json";
import enAdminDashboard from "@/messages/en/admin.dashboard.json";
import deAdminDashboard from "@/messages/de/admin.dashboard.json";
import roAdminRestaurants from "@/messages/ro/admin.restaurants.json";
import enAdminRestaurants from "@/messages/en/admin.restaurants.json";
import deAdminRestaurants from "@/messages/de/admin.restaurants.json";
import roAdminInvitations from "@/messages/ro/admin.invitations.json";
import enAdminInvitations from "@/messages/en/admin.invitations.json";
import deAdminInvitations from "@/messages/de/admin.invitations.json";
import roAdminReviews from "@/messages/ro/admin.reviews.json";
import enAdminReviews from "@/messages/en/admin.reviews.json";
import deAdminReviews from "@/messages/de/admin.reviews.json";
import roAdminGdpr from "@/messages/ro/admin.gdpr.json";
import enAdminGdpr from "@/messages/en/admin.gdpr.json";
import deAdminGdpr from "@/messages/de/admin.gdpr.json";
import roAdminUsers from "@/messages/ro/admin.users.json";
import enAdminUsers from "@/messages/en/admin.users.json";
import deAdminUsers from "@/messages/de/admin.users.json";
import roAdminSetups from "@/messages/ro/admin.setups.json";
import enAdminSetups from "@/messages/en/admin.setups.json";
import deAdminSetups from "@/messages/de/admin.setups.json";
import roAdminSecurity from "@/messages/ro/admin.security.json";
import enAdminSecurity from "@/messages/en/admin.security.json";
import deAdminSecurity from "@/messages/de/admin.security.json";
import roAdminAuth from "@/messages/ro/admin.auth.json";
import enAdminAuth from "@/messages/en/admin.auth.json";
import deAdminAuth from "@/messages/de/admin.auth.json";

import roPartnerReservations from "@/messages/ro/partner.reservations.json";
import enPartnerReservations from "@/messages/en/partner.reservations.json";
import dePartnerReservations from "@/messages/de/partner.reservations.json";

import roPartnerMenu from "@/messages/ro/partner.menu.json";
import enPartnerMenu from "@/messages/en/partner.menu.json";
import dePartnerMenu from "@/messages/de/partner.menu.json";

import roPartnerTables from "@/messages/ro/partner.tables.json";
import enPartnerTables from "@/messages/en/partner.tables.json";
import dePartnerTables from "@/messages/de/partner.tables.json";

import roPartnerDiners from "@/messages/ro/partner.diners.json";
import enPartnerDiners from "@/messages/en/partner.diners.json";
import dePartnerDiners from "@/messages/de/partner.diners.json";

import roPartnerMarketing from "@/messages/ro/partner.marketing.json";
import enPartnerMarketing from "@/messages/en/partner.marketing.json";
import dePartnerMarketing from "@/messages/de/partner.marketing.json";

import roPartnerAnalytics from "@/messages/ro/partner.analytics.json";
import enPartnerAnalytics from "@/messages/en/partner.analytics.json";
import dePartnerAnalytics from "@/messages/de/partner.analytics.json";

import roPartnerBilling from "@/messages/ro/partner.billing.json";
import enPartnerBilling from "@/messages/en/partner.billing.json";
import dePartnerBilling from "@/messages/de/partner.billing.json";

import roPartnerStaffSecurity from "@/messages/ro/partner.staffSecurity.json";
import enPartnerStaffSecurity from "@/messages/en/partner.staffSecurity.json";
import dePartnerStaffSecurity from "@/messages/de/partner.staffSecurity.json";

import roPartnerSettings from "@/messages/ro/partner.settings.json";
import enPartnerSettings from "@/messages/en/partner.settings.json";
import dePartnerSettings from "@/messages/de/partner.settings.json";

import roPartnerCorporate from "@/messages/ro/partner.corporate.json";
import enPartnerCorporate from "@/messages/en/partner.corporate.json";
import dePartnerCorporate from "@/messages/de/partner.corporate.json";

import roPartnerOrg from "@/messages/ro/partner.org.json";
import enPartnerOrg from "@/messages/en/partner.org.json";
import dePartnerOrg from "@/messages/de/partner.org.json";

import roPartnerOnboarding from "@/messages/ro/partner.onboarding.json";
import enPartnerOnboarding from "@/messages/en/partner.onboarding.json";
import dePartnerOnboarding from "@/messages/de/partner.onboarding.json";

import roPartnerDashboard from "@/messages/ro/partner.dashboard.json";
import enPartnerDashboard from "@/messages/en/partner.dashboard.json";
import dePartnerDashboard from "@/messages/de/partner.dashboard.json";

import roPartnerReviews from "@/messages/ro/partner.reviews.json";
import enPartnerReviews from "@/messages/en/partner.reviews.json";
import dePartnerReviews from "@/messages/de/partner.reviews.json";

/**
 * Structural contract for the universal `ui` namespace — generic micro-labels
 * used by primitive components rendered across multiple shells (consumer,
 * partner, admin). This namespace is added to every `buildBundle` call so that
 * `useT("ui")` is safe on any render path.
 */
export interface UiMessages {
  close: string;
  clear: string;
  removeFilter: string;
  showPassword: string;
  hidePassword: string;
  openMap: string;
  statusBadge: {
    openNow: string;
    closed: string;
    closesAt: string;
    opensAt: string;
  };
}

/** Structural contract for the `common` namespace. */
export interface CommonMessages {
  languageName: string;
  switchLanguage: string;
  meta: { title: string; description: string };
  locales: Record<Locale, string>;
  cities: Record<string, string>;
}

/** Structural contract for the `discovery` namespace. */
export interface DiscoveryMessages {
  meta: { title: string; description: string };
  search: {
    placeholder: string;
    back: string;
    recentTitle: string;
    clearAll: string;
    trendingTitle: string;
    categoriesTitle: string;
    resultsRestaurants: string;
    resultsCuisines: string;
    noResults: string;
    cuisineCount: { one: string; few: string; other: string };
    trending: { bbq: string; rooftop: string; brunch: string; newOpenings: string };
    categories: {
      pizza: string; japanese: string; steak: string; vegan: string;
      coffee: string; cocktails: string; burgers: string; fish: string;
    };
  };
  filters: {
    all: string;
    openNow: string;
    privateEvent: string;
    cuisine: string;
    price: string;
    neighborhood: string;
    more: string;
    moreAriaLabel: string;
    title: string;
    reset: string;
    minRating: string;
    ratingAny: string;
    noResults: string;
    showResults: { one: string; few: string; other: string };
    priceAccessible: string;
    priceModerate: string;
    pricePremium: string;
    priceExclusive: string;
  };
  feed: {
    noMatchTitle: string;
    noMatchBody: string;
    resetFilters: string;
    trendingTitle: string;
    trendingSubtitle: string;
    availableTodayTitle: string;
    availableTodaySubtitle: string;
    newTitle: string;
    newSubtitle: string;
    weekRestaurant: string;
    availableToday: string;
    viewRestaurant: string;
  };
  map: {
    searchPlaceholder: string;
    filters: string;
    closeMap: string;
  };
  card: {
    saveAriaLabel: string;
    viewAriaLabel: string;
    privateEventBadge: string;
    reviews: { one: string; few: string; other: string };
    topDimension: string;
  };
  cover: {
    tagline: string;
    availableCount: { one: string; few: string; other: string };
    availableIntro: string;
    searchCta: string;
  };
  dietary: {
    vegan: string;
    vegetarian: string;
    glutenFree: string;
    spicy: string;
    clear: string;
  };
  tabs: {
    discover: string;
    map: string;
    search: string;
    saved: string;
    profile: string;
    navAriaLabel: string;
  };
  nav: {
    logoAriaLabel: string;
    searchPlaceholder: string;
    savedAriaLabel: string;
    profileAriaLabel: string;
  };
  timeContext: {
    greetings: {
      morning: string;
      brunch: string;
      lunch: string;
      afternoon: string;
      evening: string;
      late: string;
      default: string;
    };
    subtexts: {
      morning: { one: string; few: string; other: string };
      brunch: { one: string; few: string; other: string };
      lunch: { one: string; few: string; other: string };
      afternoon: { one: string; few: string; other: string };
      evening: { one: string; few: string; other: string };
      late: { one: string; few: string; other: string };
      default: { one: string; few: string; other: string };
    };
    chips: {
      morning: string;
      brunch: string;
      lunch: string;
      afternoon: string;
      evening: string;
      late: string;
      terrace: string;
      cocktails: string;
    };
    pullQuotes: {
      morning: { eyebrow: string; body: string };
      brunch: { eyebrow: string; body: string };
      lunch: { eyebrow: string; body: string };
      afternoon: { eyebrow: string; body: string };
      evening: { eyebrow: string; body: string };
      late: { eyebrow: string; body: string };
      default: { eyebrow: string; body: string };
    };
  };
}

/** Structural contract for the `restaurant` namespace. */
export interface RestaurantMessages {
  notFound: { title: string; back: string };
  detail: {
    availableToday: string;
    noSlotsTitle: string;
    noSlotsBody: string;
    bookOtherDay: string;
    readMore: string;
    showLess: string;
    chefPicksTitle: string;
    chefPicksSubtitle: string;
    viewMenu: string;
    viewMenuLabel: string;
    viewMenuFull: string;
    pickBadge: string;
    viewMenuRecommendations: { one: string; few: string; other: string };
    reviewsTitle: string;
    reviewsSubtitle: string;
    scheduleTitle: string;
    scheduleSubtitle: string;
    locationTitle: string;
    locationSubtitle: string;
    directionsLink: string;
    nearbyTitle: string;
    nearbySubtitle: string;
    bookTable: string;
    stickyBookCta: string;
    stickyNextSlot: string;
    mapTitle: string;
  };
  gallery: {
    backAriaLabel: string;
    saveAriaLabel: string;
    shareAriaLabel: string;
    prevAriaLabel: string;
    nextAriaLabel: string;
    goToPhotoAriaLabel: string;
  };
  reviewCard: {
    bookedContext: string;
    guestOne: string;
    guestOther: string;
    helpful: string;
    restaurantReply: string;
  };
  reviewIntelligence: {
    title: string;
    basedOn: { one: string; few: string; other: string };
    topMentionsTitle: string;
    bestForTitle: string;
  };
  cuisineAdjectives: Record<string, string>;
  meta: { titlePattern: string; descriptionFallback: string };
}

/** Structural contract for the `menu` namespace. */
export interface MenuMessages {
  meta: {
    title: string;
  };
  viewer: {
    backAriaLabel: string;
    menuLabel: string;
    dishesCount: { one: string; few: string; other: string };
    priceRange: string;
    chefPicksTitle: string;
    chefPicksCount: { one: string; few: string; other: string };
    viewItem: string;
    noMatchBody: string;
    clearFilters: string;
    qrScanPrompt: string;
  };
  itemCard: {
    chefPickAriaLabel: string;
    popularLabel: string;
    veganLabel: string;
    vegetarianLabel: string;
    glutenFreeLabel: string;
    spicyLabel: string;
  };
  itemSheet: {
    chefPickAriaLabel: string;
    popularLabel: string;
    veganLabel: string;
    vegetarianLabel: string;
    glutenFreeLabel: string;
    spicyLabel: string;
    chefNoteTitle: string;
    chefNoteBody: string;
    moreFromSection: string;
  };
  pageClient: {
    noMenuTitle: string;
    noMenuBody: string;
    backTo: string;
  };
  poweredBy: string;
}

/** Structural contract for the `booking` namespace. */
export interface BookingMessages {
  slots: {
    more: string;
    anotherDay: string;
  };
  sheet: {
    headerLabel: string;
    progress: string;
    back: string;
    continue: string;
    submitting: string;
    submit: string;
    errorGeneric: string;
    errorName: string;
    errorPhone: string;
    errorEmail: string;
    stepDate: { title: string; today: string; tomorrow: string };
    stepParty: {
      title: string;
      decrementAriaLabel: string;
      incrementAriaLabel: string;
      privateEventHint: string;
      privateEventLink: string;
    };
    stepSlot: {
      title: string;
      subtitle: string;
      loadingAriaLabel: string;
      noSlots: string;
      noSlotsHint: string;
      zoneLabel: string;
      allZones: string;
    };
    stepIdentity: {
      title: string;
      nameLabel: string;
      phoneLabel: string;
      emailLabel: string;
      occasionLabel: string;
      occasionNone: string;
      occasionBirthday: string;
      occasionAnniversary: string;
      birthdayDateLabel: string;
      anniversaryDateLabel: string;
      notesLabel: string;
      summaryToday: string;
      summaryTomorrow: string;
      guests: { one: string; few: string; other: string };
      companyToggleLabel: string;
      companyCui: {
        fieldLabel: string;
        placeholder: string;
        searchingAriaLabel: string;
        foundAriaLabel: string;
        resolvedPrefix: string;
      };
    };
    stepSent: {
      title: string;
      subtitle: string;
      viewReservation: string;
      backToRestaurant: string;
    };
  };
  confirmed: {
    eyebrow: string;
    awaitingYou: string;
    forParty: string;
    waitingBadge: string;
    addressLabel: string;
    directionsLink: string;
    phoneLabel: string;
    calendarLabel: string;
    calendarDownload: string;
    calendarAriaLabel: string;
    needToCancel: string;
    cancelLink: string;
    partyUnit: { one: string; few: string; other: string };
    icsSummary: string;
  };
  cancel: {
    reasonLabel: string;
    reasonPlaceholder: string;
    submitPending: string;
    submitLabel: string;
    confirmDialog: string;
    doneTitle: string;
    doneBody: string;
    errorGeneric: string;
  };
  modify: {
    pageTitle: string;
    modifyingLabel: string;
    dateLabel: string;
    timeLabel: string;
    partySizeLabel: string;
    submitPending: string;
    submitLabel: string;
    doneTitle: string;
    doneBody: string;
    errorGeneric: string;
    windowClosedBody: string;
    callLink: string;
    emailLink: string;
    backLink: string;
    configMissing: string;
    notFound: string;
  };
  tokenPage: {
    reservationLabel: string;
    alreadyCancelledTitle: string;
    alreadyCancelledBody: string;
    completedTitle: string;
    completedBody: string;
    notFoundTitle: string;
    notFoundBody: string;
    configMissingTitle: string;
    configMissingBody: string;
    contactLabel: string;
  };
  errors: {
    modifyWindowClosed: string;
    modifyTerminal: string;
    modifySlotFull: string;
    modifyConflict: string;
    modifyFailed: string;
    configMissing: string;
    cancelFailed: string;
  };
}

/** Structural contract for the `reviews` namespace. */
export interface ReviewsMessages {
  page: {
    eyebrow: string;
    readyHeading: string;
    readyBody: string;
    alreadyReviewedTitle: string;
    alreadyReviewedBody: string;
    ineligibleTitle: string;
    ineligibleBody: string;
    notFoundTitle: string;
    notFoundBody: string;
    configMissingTitle: string;
    configMissingBody: string;
    contactLabel: string;
  };
  form: {
    ratingLegend: string;
    commentLabel: string;
    commentOptional: string;
    commentPlaceholder: string;
    aggregateLabel: string;
    submitPending: string;
    submitLabel: string;
    errorNoRating: string;
    errorGeneric: string;
    doneTitle: string;
    doneBody: string;
  };
  errors: {
    rateLimited: string;
    visitNotYet: string;
    windowExpired: string;
    editWindowExpired: string;
    editHidden: string;
    editFailed: string;
    ratingRange: string;
    commentTooLong: string;
    platformNotConfigured: string;
    reservationNotFound: string;
    ineligible: string;
    alreadyReviewed: string;
    couldNotSave: string;
  };
}

/** Structural contract for the `events` namespace. */
export interface EventsMessages {
  meta: {
    title: string;
    description: string;
  };
  cta: {
    organise: string;
    organisePrivate: string;
    organiseSubtitle: string;
  };
  sheet: {
    titleSuffix: string;
    closeAriaLabel: string;
    occasion: {
      heading: string;
      labels: Record<string, string>;
    };
    date: { label: string; timePrefLabel: string; timePrefPlaceholder: string };
    details: {
      persoanelLabel: string;
      spaceLabel: string;
      budgetLabel: string;
      menuLabel: string;
      dietaryLabel: string;
      notesLabel: string;
    };
    identity: {
      nameLabel: string;
      emailLabel: string;
      phoneLabel: string;
      companyCheckLabel: string;
      cuiLabel: string;
      companyNameLabel: string;
    };
    continue: string;
    back: string;
    submitPending: string;
    submitLabel: string;
    errorGeneric: string;
  };
  sheetV2: {
    titleSuffix: string;
    closeAriaLabel: string;
    dialogAriaLabel: string;
    progress: { stepLabel: string };
    stepOccasion: {
      heading: string;
      subheading: string;
      occasions: Record<string, { label: string; blurb: string }>;
      continue: string;
    };
    stepDate: {
      heading: string;
      leadTimeNotice: string;
      timePrefLabel: string;
      timePrefPlaceholder: string;
      back: string;
      continue: string;
    };
    stepDetails: {
      heading: string;
      partySizeLabel: string;
      spaceLabel: string;
      spaceFreeLabel: string;
      budgetLabel: string;
      menuSectionLabel: string;
      menuPlaceholder: string;
      dietaryPlaceholder: string;
      notesPlaceholder: string;
      back: string;
      continue: string;
    };
    stepIdentity: {
      heading: string;
      nameLabel: string;
      emailLabel: string;
      phoneLabel: string;
      companyCheckLabel: string;
      confirmationNotice: string;
      errorNoOccasion: string;
      back: string;
      submitPending: string;
      submitLabel: string;
    };
    stepSent: {
      heading: string;
      body: string;
      spamNotice: string;
    };
  };
  landing: {
    hero: {
      eyebrow: string;
      heading: string;
      body: string;
      venueCount: { one: string; few: string; other: string };
    };
    occasionGrid: {
      heading: string;
      occasions: Record<string, { label: string; blurb: string }>;
      allLabel: string;
      filteredHeading: string;
      empty: string;
      resultCount: { one: string; few: string; other: string };
    };
    allVenuesHeading: string;
  };
  tracking: {
    requestLabel: string;
    partySizeUnit: string;
    partnerResponseLabel: string;
    quoteLabel: string;
    quoteCurrency: string;
    acceptQuote: string;
    declineQuote: string;
    declineReasonPrefix: string;
    cancelRequest: string;
    status: Record<string, string>;
    timeline: {
      ariaLabel: string;
      steps: { submitted: string; viewing: string; quoted: string; decided: string };
    };
    expiry: {
      expired: string;
      prefix: string;
      days: PluralBag;
      dayHours: string;
      today: string;
    };
    partnerBadge: {
      viewingAriaLabel: string;
      viewingText: string;
      verifiedText: string;
    };
  };
  cuiLookup: {
    searchingAriaLabel: string;
    foundAriaLabel: string;
    denumirePrefix: string;
  };
  roomPicker: {
    capacityRange: string;
    fits: PluralBag;
  };
}

/** Structural contract for the public `meetingSpaces` namespace (sheet + CTA). */
export interface MeetingSpacesMessages {
  cta: { title: string; subtitle: string };
  sheet: {
    titleSuffix: string;
    dialogAriaLabel: string;
    closeAriaLabel: string;
    progress: { stepLabel: string };
    back: string;
    next: string;
  };
  stepDate: { title: string; dateLabel: string; today: string; tomorrow: string };
  stepSpace: {
    title: string;
    seats: PluralBag;
    ratePerHour: string;
    rateFree: string;
    hours: string;
    empty: string;
  };
  stepSlot: {
    title: string;
    durationLabel: string;
    durationOptionMinutes: string;
    loading: string;
    noSlots: string;
    totalLabel: string;
    totalFree: string;
  };
  stepIdentity: {
    title: string;
    nameLabel: string;
    emailLabel: string;
    phoneLabel: string;
    phoneOptional: string;
    companyLabel: string;
    companyOptional: string;
    partyLabel: string;
    notesLabel: string;
    notesOptional: string;
    notesPlaceholder: string;
    submit: string;
    submitting: string;
    errorRequired: string;
    errorPartyTooBig: string;
    errorSlotTaken: string;
    errorGeneric: string;
  };
  stepSent: { title: string; body: string; summary: string };
}

/** Structural contract for the `profile` namespace. */
export interface ProfileMessages {
  screen: {
    defaultDisplayName: string;
    memberSince: string;
    settingsTitle: string;
    cityLabel: string;
    notificationsLabel: string;
    notificationsAriaLabel: string;
    legalTitle: string;
    legalPrivacy: string;
    legalTerms: string;
    legalCookies: string;
    legalAnpc: string;
    legalContact: string;
    signOut: string;
    signedOutTitle: string;
    signedOutBody: string;
    signIn: string;
  };
  saved: {
    savedTitle: string;
    emptyTitle: string;
    emptyBody: string;
    discoverAction: string;
    bookingsTitle: string;
    bookingsEmptyTitle: string;
    bookingsEmptyBody: string;
    bookingAt: string;
    bookingGuests: { one: string; few: string; other: string };
  };
  auth: {
    signInTitle: string;
    signUpTitle: string;
    signInSubmit: string;
    signUpSubmit: string;
    signInLoading: string;
    signUpLoading: string;
    emailPlaceholder: string;
    emailAriaLabel: string;
    passwordPlaceholder: string;
    passwordAriaLabel: string;
    signInSubtitle: string;
    signUpSubtitle: string;
    confirmationTitle: string;
    confirmationBody: string;
    confirmationAck: string;
    switchToSignUp: string;
    switchToSignIn: string;
    legalPrefix: string;
    legalTerms: string;
    legalAnd: string;
    legalPrivacy: string;
  };
  citySelector: {
    ariaLabel: string;
    comingSoon: string;
  };
  empty: Record<string, never>;
}

/** Plural-bag type used across the emails catalogue. */
type PluralBag = { one: string; few: string; other: string };

/** Structural contract for the `emails` namespace. */
export interface EmailsMessages {
  confirmation: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    guests: PluralBag;
    reminderText: string;
    cancelButton: string;
    footer: string;
  };
  reminder: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    guests: PluralBag;
    cancelHint: string;
    manageButton: string;
    footer: string;
  };
  postVisit: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    greetingNoName: string;
    instructionText: string;
    footer: string;
  };
  partnerAlert: {
    subject: string;
    preview: string;
    heading: string;
    covers: PluralBag;
    zoneLabel: string;
    notesLabel: string;
    manageText: string;
    footer: string;
  };
  partnerCancelled: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    guests: PluralBag;
    apologyText: string;
    rebookButton: string;
    footer: string;
  };
  eventNew: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    detailsLabel: string;
    occasionWedding: string;
    occasionBirthday: string;
    occasionCorporateDinner: string;
    occasionProductLaunch: string;
    occasionOther: string;
    cta: string;
  };
  eventReplied: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    responseLabel: string;
    cta: string;
  };
  eventQuoted: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    amountLabel: string;
    expiresLabel: string;
    cta: string;
    currency: string;
  };
  eventAccepted: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    detailsLabel: string;
    amountLabel: string;
    cta: string;
    currency: string;
  };
  eventDeclined: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    reasonLabel: string;
    reasonNoAvailability: string;
    reasonOutOfCapacity: string;
    reasonBudgetMismatch: string;
    reasonOther: string;
    cta: string;
  };
  eventExpired: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    detailsLabel: string;
    cta: string;
  };
  eventNudge: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    detailsLabel: string;
    cta: string;
  };
}

/** Structural contract for the `admin.common` namespace (admin shell chrome). */
export interface AdminCommonMessages {
  nav: {
    eyebrow: string;
    signOut: string;
    openNav: string;
    closeNav: string;
    items: {
      dashboard: string;
      restaurants: string;
      invitations: string;
    };
  };
}

/** Structural contract for the `admin.dashboard` namespace (admin home/overview). */
export interface AdminDashboardMessages {
  page: {
    title: string;
    subtitle: string;
  };
  stats: {
    liveRestaurants: string;
    pendingReview: string;
    drafts: string;
    openInvitations: string;
  };
  recent: {
    title: string;
    placeholder: string;
  };
}

/** Structural contract for the `admin.restaurants` namespace (restaurant approval/management). */
export interface AdminRestaurantsMessages {
  list: {
    title: string;
    subtitle: PluralBag;
    loadError: string;
    table: {
      name: string;
      cuisine: string;
      city: string;
      status: string;
      actions: string;
    };
    view: string;
    empty: string;
  };
  detail: {
    back: string;
    viewPublicPage: string;
    rows: {
      slug: string;
      address: string;
      phone: string;
      website: string;
      heroNote: string;
      coordinates: string;
      photos: string;
      rating: string;
      organization: string;
      created: string;
    };
    notGeocoded: string;
    noRatings: string;
    ratingValue: string;
    unassigned: string;
    ownerSuffix: string;
    empty: string;
  };
  notFound: {
    title: string;
    body: string;
    back: string;
  };
  status: {
    list: Record<string, string>;
    detail: Record<string, string>;
  };
  actions: {
    suspend: string;
    unsuspend: string;
  };
  errors: {
    unauthorised: string;
  };
}

/** Structural contract for the `admin.invitations` namespace (restaurant onboarding invitations). */
export interface AdminInvitationsMessages {
  page: {
    title: string;
    subtitle: string;
    newHeading: string;
    sentHeading: string;
    loadError: string;
    table: {
      email: string;
      restaurant: string;
      city: string;
      status: string;
      expires: string;
      actions: string;
    };
    empty: string;
  };
  form: {
    emailLabel: string;
    emailPlaceholder: string;
    cityLabel: string;
    cityPlaceholder: string;
    nameLabel: string;
    nameOptional: string;
    namePlaceholder: string;
    submitPending: string;
    submit: string;
    devModeTitle: string;
    sentTitle: string;
    devModeHint: string;
    sentHint: string;
    copyAriaLabel: string;
    copied: string;
    copy: string;
    toastSent: string;
    toastCopied: string;
  };
  row: {
    empty: string;
    resend: string;
    revoke: string;
    reissue: string;
    accepted: string;
    revokeConfirm: string;
    toastResendFailed: string;
    toastDevLinkCopied: string;
    toastDevLink: string;
    toastResent: string;
    toastRevoked: string;
  };
  status: Record<string, string>;
  email: {
    subject: string;
    subjectNamed: string;
    subjectResent: string;
  };
  errors: {
    unauthorised: string;
    validEmailRequired: string;
    cityRequired: string;
    notFound: string;
  };
}

/** Structural contract for the `admin.reviews` namespace (DSA review-report moderation queue). */
export interface AdminReviewsMessages {
  page: {
    title: string;
    subtitle: string;
    subtitleFlag: string;
  };
  empty: {
    title: string;
  };
  report: {
    label: string;
    detailsLabel: string;
    reviewIdLabel: string;
    reviewGone: string;
    alreadyHidden: string;
    reportedAt: string;
    reporterIp: string;
  };
  actions: {
    uphold: string;
    dismiss: string;
  };
  reasons: Record<string, string>;
}

/** Structural contract for the `admin.gdpr` namespace (GDPR data-erasure request handling). */
export interface AdminGdprMessages {
  list: {
    title: string;
    subtitle: string;
    openHeading: string;
    openEmpty: string;
    closedHeading: string;
    table: {
      id: string;
      kind: string;
      source: string;
      identifier: string;
      diner: string;
      status: string;
      deadline: string;
      created: string;
    };
    empty: string;
    unresolved: string;
    deadlineDays: string;
  };
  detail: {
    back: string;
    heading: string;
    statusLabel: string;
    deadlineLabel: string;
    deadlineExtended: string;
    subjectHeading: string;
    phoneLabel: string;
    emailLabel: string;
    resolvedDinerLabel: string;
    unresolved: string;
    sourceLabel: string;
    empty: string;
    requestBodyHeading: string;
    identityHeading: string;
    identityVerified: string;
    actionsHeading: string;
    cascadeHeading: string;
    cascadeEmpty: string;
    cascadeTable: {
      time: string;
      subject: string;
      reason: string;
      columns: string;
    };
  };
  failureBanner: {
    title: string;
    body: string;
    retryConfirm: string;
    retryPending: string;
    retry: string;
    retryFailed: string;
  };
  resolveDiner: {
    trigger: string;
    title: string;
    body: string;
    placeholder: string;
    cancel: string;
    submitPending: string;
    submit: string;
    failed: string;
  };
  verifyIdentity: {
    trigger: string;
    title: string;
    body: string;
    placeholder: string;
    cancel: string;
    submitPending: string;
    submit: string;
    failed: string;
  };
  approveErasure: {
    confirm: string;
    pending: string;
    approve: string;
    failed: string;
  };
  reject: {
    trigger: string;
    title: string;
    body: string;
    placeholder: string;
    cancel: string;
    submitPending: string;
    submit: string;
    failed: string;
  };
  extendDeadline: {
    trigger: string;
    title: string;
    body: string;
    daysLabel: string;
    placeholder: string;
    cancel: string;
    submitPending: string;
    submit: string;
    failed: string;
  };
}

/** Structural contract for the `admin.users` namespace (user management: list, drawer, impersonate). */
export interface AdminUsersMessages {
  list: {
    title: string;
    searchPlaceholder: string;
    search: string;
  };
  table: {
    email: string;
    role: string;
    mfa: string;
    lastSignIn: string;
    lastImpersonated: string;
    empty: string;
    minAgo: PluralBag;
    hoursAgo: PluralBag;
    daysAgo: PluralBag;
    noUsers: string;
  };
  drawer: {
    close: string;
    orgMembershipsHeading: string;
    orgMembershipMeta: string;
    orgMembershipsEmpty: string;
    restaurantStaffHeading: string;
    restaurantStaffMeta: string;
    restaurantStaffEmpty: string;
    mfaFactorsHeading: string;
    authenticatorFallback: string;
    mfaFactorMeta: string;
    mfaFactorsEmpty: string;
    auditHeading: string;
    impersonatedBy: string;
    auditEmpty: string;
    statusActive: string;
    statusInactive: string;
  };
  impersonate: {
    trigger: string;
    title: string;
    body: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    cancel: string;
    submit: string;
  };
}

/** Structural contract for the `admin.setups` namespace (in-flight onboarding monitor). */
export interface AdminSetupsMessages {
  page: {
    eyebrow: string;
    title: string;
  };
  stats: {
    atRiskLabel: string;
    atRiskHint: string;
    awaitingLabel: string;
    awaitingHint: string;
    stuckLabel: string;
    stuckHint: string;
  };
  table: {
    organization: string;
    restaurant: string;
    progress: string;
    trialExpires: string;
    status: string;
    empty: string;
  };
  badge: {
    atRisk: string;
    stuck: string;
    awaiting: string;
    ok: string;
  };
}

/** Structural contract for the `admin.security` namespace (admin's own 2FA/sessions). */
export interface AdminSecurityMessages {
  page: {
    title: string;
  };
  enrolRequired: {
    title: string;
    body: string;
  };
  errors: {
    codeRequired: string;
    notSignedIn: string;
    factorRequired: string;
    couldNotRemove: string;
    mismatch: string;
    tooShort: string;
    breached: string;
  };
}

/**
 * Structural contract for the `admin.auth` namespace (standalone admin sign-in
 * page). This page lives outside the `(gated)` admin shell, so it carries its
 * own per-page MessagesProvider rather than relying on the shell bundle.
 */
export interface AdminAuthMessages {
  page: {
    brandEyebrow: string;
    panelHeading: string;
    restrictedNotice: string;
    title: string;
  };
  form: {
    emailLabel: string;
    passwordLabel: string;
    submit: string;
    submitPending: string;
    createdByTeam: string;
    mfaCodeLabel: string;
    mfaSubmit: string;
    mfaSubmitPending: string;
    recoveryToggle: string;
    recoveryPlaceholder: string;
    recoveryHint: string;
    recoverySubmit: string;
  };
  errors: {
    supabaseNotConfigured: string;
    sessionExpired: string;
    enterCode: string;
    challengeFailed: string;
    incorrectCode: string;
    invalidRecoveryCode: string;
    emailPasswordRequired: string;
    invalidCredentials: string;
    notAuthorisedForAdmin: string;
  };
}

/** Structural contract for the `partner.common` namespace (shell chrome). */
export interface PartnerCommonMessages {
  nav: {
    eyebrow: string;
    /** Back-link shown on standalone account pages (marketing, billing, org). */
    backToDashboard: string;
    /** Eyebrow above the page title on standalone account pages. */
    accountEyebrow: string;
    signOut: string;
    openMenu: string;
    closeMenu: string;
    openRequestsBadge: PluralBag;
    items: {
      dashboard: string;
      profile: string;
      hours: string;
      photos: string;
      menu: string;
      translations: string;
      availability: string;
      reservations: string;
      floor: string;
      staff: string;
      diners: string;
      reviews: string;
      corporate: string;
      spaces: string;
      marketing: string;
      org: string;
      billing: string;
      preview: string;
    };
  };
  bell: {
    ariaLabel: string;
    empty: string;
    kinds: {
      new_event_request: string;
      event_request_replied: string;
      event_request_quoted: string;
      quote_accepted: string;
      quote_declined: string;
      event_request_cancelled: string;
    };
  };
  /** Generic action errors shared across partner server actions. */
  errors: {
    notAuthenticated: string;
    noRestaurant: string;
  };
  /** Comma-joined short weekday/month names for locale-aware date labels. */
  dateFormat: {
    weekdaysShort: string;
    monthsShort: string;
  };
  /** Shared PhotoUploader component (onboard wizard + settings/photos). */
  photoUploader: {
    notImage: string;
    tooLarge: string;
    uploadFailedFallback: string;
    uploadFailed: string;
    deleteConfirm: string;
    deleteFailed: string;
    setHeroFailed: string;
    uploading: string;
    addPhotos: string;
    hint: string;
    heroBadge: string;
    setHeroAriaLabel: string;
    deleteAriaLabel: string;
  };
  /** Shared HoursEditor component (onboard wizard + settings/hours). */
  hoursEditor: {
    /** Comma-joined full weekday names, index 0 = Sunday. */
    weekdaysFull: string;
    copyFirstOpen: string;
    open: string;
  };
  /** Sidebar venue picker (shell component). */
  venueSwitcher: {
    orgDashboard: string;
  };
}

/** Structural contract for the `partner.reservations` namespace. */
export interface PartnerReservationsMessages {
  page: { title: string; subtitle: string; noRestaurant: string };
  tabs: { today: string; upcoming: string; past: string };
  status: {
    confirmed: string;
    seated: string;
    completed: string;
    cancelled: string;
    no_show: string;
  };
  table: {
    when: string;
    client: string;
    party: string;
    zone: string;
    tableAssignment: string;
    status: string;
    actions: string;
  };
  empty: {
    today: string;
    upcoming: string;
    past: string;
    pastHint: string;
    defaultHint: string;
  };
  actions: { seat: string; noShow: string; cancel: string; complete: string };
  toast: {
    seated: string;
    noShow: string;
    completed: string;
    updateFailed: string;
  };
  cancel: {
    title: string;
    summaryParty: string;
    reasonsTitle: string;
    reasons: {
      restaurant_closed: string;
      overbooked: string;
      kitchen_issue: string;
      private_event: string;
      other: string;
    };
    reasonsHint: string;
    keep: string;
    submitPending: string;
    submit: string;
    toastCancelled: string;
    toastCancelledNoEmail: string;
    cancelFailed: string;
  };
  errors: {
    noPermissionAction: string;
    invalidReason: string;
    noPermissionCancel: string;
    notFound: string;
    onlyConfirmed: string;
  };
  badge: { corporate: string; standing: string };
  filters: { corporateOnly: string };
}

/** Structural contract for the `partner.menu` namespace. */
export interface PartnerMenuMessages {
  page: { title: string; subtitle: string; noRestaurant: string };
  printQr: { disabledTitle: string; label: string };
  qr: {
    title: string;
    subtitle: string;
    noCity: string;
    layoutLabel: string;
    single: string;
    sheet: string;
    print: string;
    scanPrompt: string;
  };
  editor: {
    emptyTitle: string;
    emptyBody1: string;
    addFirstSection: string;
    addSection: string;
    addItem: string;
    collapse: string;
    expand: string;
    editSection: string;
    deleteSection: string;
    editItem: string;
    deleteItem: string;
    unavailable: string;
    itemCount: PluralBag;
    price: string;
    confirmDeleteSection: string;
    confirmDeleteItem: string;
  };
  sectionDialog: {
    titleNew: string;
    titleEdit: string;
    close: string;
    nameLabel: string;
    namePlaceholder: string;
    introLabel: string;
    introPlaceholder: string;
    cancel: string;
    saving: string;
    create: string;
    save: string;
    genericError: string;
  };
  itemDialog: {
    titleNew: string;
    titleEdit: string;
    close: string;
    nameLabel: string;
    namePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    priceLabel: string;
    pricePlaceholder: string;
    available: string;
    tagsLabel: string;
    tags: {
      vegetarian: string;
      vegan: string;
      gluten_free: string;
      spicy: string;
      popular: string;
    };
    chefPick: string;
    cancel: string;
    saving: string;
    saveChanges: string;
    addItem: string;
    genericError: string;
  };
  errors: {
    sectionNameRequired: string;
    chooseSection: string;
    invalidItemRef: string;
    nameRequired: string;
    priceNonNegative: string;
  };
}

/** Structural contract for the `partner.tables` namespace. */
export interface PartnerTablesMessages {
  page: {
    title: string;
    subtitlePrefix: string;
    subtitleSuffix: string;
    noRestaurant: string;
  };
  live: {
    title: string;
    freeNow: PluralBag;
    now: string;
    totalSuffix: string;
    editPlan: string;
    noAccess: string;
  };
  status: {
    free: string;
    booked: string;
    seated: string;
    paying: string;
    dirty: string;
    combined: string;
    blocked: string;
  };
  liveFloor: {
    noSection: string;
    combineCancel: string;
    combineStart: string;
    combineSelection: string;
    selected: string;
    select: string;
    dissolve: string;
    transitionTo: string;
    clearReasonPrompt: string;
    errorInvalidTransition: string;
    errorFailed: string;
  };
  reservationsPanel: {
    title: string;
    empty: string;
    party: PluralBag;
    pickTableAriaLabel: string;
    pickTablePlaceholder: string;
    tableOption: string;
    seat: string;
  };
  walkinPanel: {
    title: string;
    namePlaceholder: string;
    partyAriaLabel: string;
    phonePlaceholder: string;
    add: string;
    empty: string;
    party: string;
    statusCalled: string;
    statusWaiting: string;
    waitSuffix: string;
    call: string;
    seat: string;
    left: string;
  };
  floorPlan: {
    toggleLayout: string;
    toggleTonight: string;
    tonightSummary: string;
    free: string;
    seatCount: string;
    entrance: string;
    toastUpdateFailed: string;
    toastAddFailed: string;
    toastDeleteFailed: string;
    fitView: string;
    zoomIn: string;
    zoomOut: string;
  };
  emptyInspector: {
    title: string;
    body: string;
    addTable: string;
    dragHint: string;
  };
  editInspector: {
    title: string;
    deleteTableAriaLabel: string;
    labelLabel: string;
    sectionLabel: string;
    shapeLabel: string;
    shapeRound: string;
    shapeSquare: string;
    capacityLabel: string;
    capacityUnit: string;
    bookableOnline: string;
    bookableOnlineHint: string;
  };
  tonightInspector: {
    title: string;
    summary: string;
    empty: string;
    guestParty: string;
  };
  sections: {
    heading: string;
    newSection: string;
    nameRequired: string;
    deleteConfirm: string;
    editAriaLabel: string;
    deleteAriaLabel: string;
    form: {
      nameLabel: string;
      namePlaceholder: string;
      colorLabel: string;
      colorOptional: string;
      colorPlaceholder: string;
      sortOrderLabel: string;
      cancel: string;
      saving: string;
      save: string;
      add: string;
    };
  };
}

/** Structural contract for the `partner.diners` namespace. */
export interface PartnerDinersMessages {
  list: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    searchSubmit: string;
    reset: string;
    noRestaurant: string;
    noAccess: string;
    table: { guest: string; contact: string; visits: string; lastVisit: string };
    emptySearch: string;
    empty: string;
    maskedHint: string;
  };
  detail: {
    back: string;
    fallbackName: string;
    visits: PluralBag;
    lastVisit: string;
    preferencesTitle: string;
    historyTitle: string;
    history: { date: string; venue: string; party: string; status: string };
    noVisits: string;
  };
  bucket: {
    first_timer: string;
    occasional: string;
    regular: string;
    vip: string;
    lapsed: string;
  };
  status: {
    confirmed: string;
    completed: string;
    cancelled: string;
    no_show: string;
    seated: string;
  };
  form: {
    birthday: string;
    anniversary: string;
    occasions: string;
    occasionsPlaceholder: string;
    allergies: string;
    allergiesPlaceholder: string;
    dietary: string;
    dietaryPlaceholder: string;
    notes: string;
    saving: string;
    save: string;
    saved: string;
    saveFailed: string;
    errors: { billing_locked: string; forbidden: string };
  };
}

/** Structural contract for the `partner.marketing` namespace. */
export interface PartnerMarketingMessages {
  page: {
    title: string;
    noAccess: string;
    proGateTitle: string;
    proGateBody: string;
    proGateCta: string;
    quotaOver: string;
    quotaNear: string;
    quotaSurcharge: string;
    usageTitle: string;
    usageHint: string;
    segmentsLink: string;
  };
  channels: {
    email: string;
    sms: string;
    whatsapp: string;
    in_confirmation: string;
  };
  triggeredLabels: {
    post_visit_review: string;
    pre_arrival: string;
    birthday_anniversary: string;
    lapsed_60: string;
    lapsed_120: string;
    lapsed_180: string;
    no_show_followup: string;
    welcome_series: string;
  };
  manager: {
    actionFailed: string;
    triggeredTitle: string;
    triggeredSubtitle: string;
    toggleOn: string;
    toggleOff: string;
    toggleAriaLabel: string;
    campaignStopped: string;
    campaignStarted: string;
    triggeredEmpty: string;
    oneOffTitle: string;
    newCampaign: string;
    cancel: string;
    send: string;
    sent: string;
    archive: string;
    archived: string;
    oneOffEmpty: string;
  };
  newCampaign: {
    templateLabel: string;
    templateAriaLabel: string;
    templateNone: string;
    namePlaceholder: string;
    channelAriaLabel: string;
    subjectPlaceholder: string;
    bodyPlaceholderRequired: string;
    bodyPlaceholderOptional: string;
    submit: string;
    created: string;
    errorInvalidInput: string;
    errorGeneric: string;
    localeNames: { ro: string; en: string; de: string };
  };
  segments: {
    title: string;
    subtitle: string;
    savedTitle: string;
    savedSize: string;
    savedSizeEmpty: string;
  };
  builder: {
    matchPrefix: string;
    combinatorAriaLabel: string;
    combinatorAll: string;
    combinatorAny: string;
    dimensionAriaLabel: string;
    dimensions: {
      recency: string;
      frequency: string;
      party_size: string;
      occasion: string;
      channel: string;
    };
    recencyModeAriaLabel: string;
    recencyWithin: string;
    recencyNotWithin: string;
    daysAriaLabel: string;
    daysSuffix: string;
    bucketPlaceholder: string;
    bucketAriaLabel: string;
    minPlaceholder: string;
    minAriaLabel: string;
    maxPlaceholder: string;
    maxAriaLabel: string;
    tagPlaceholder: string;
    tagAriaLabel: string;
    sourcePlaceholder: string;
    sourceAriaLabel: string;
    removeConditionAriaLabel: string;
    addCondition: string;
    estimateSize: string;
    sizeResult: PluralBag;
    nameAriaLabel: string;
    namePlaceholder: string;
    save: string;
    saved: string;
    errorPreviewInvalid: string;
    errorPreviewGeneric: string;
    errorSaveInvalid: string;
    errorSaveGeneric: string;
  };
  errors: {
    atLeastOneCondition: string;
    segmentNameRequired: string;
  };
}

/** Structural contract for the `partner.analytics` namespace. */
export interface PartnerAnalyticsMessages {
  page: { noVenue: string };
  view: {
    eyebrow: string;
    subtitlePro: string;
    subtitleBase: string;
    exportData: string;
    emptyTitle: string;
    emptyBody: string;
    delta: { up: string; down: string; unchanged: string };
    stats: { bookings: string; covers: string; completed: string; noShows: string };
    proTitle: string;
    proGate: { title: string; body: string; cta: string };
  };
  charts: {
    coversPerService: { kicker: string; title: string; empty: string; seriesCovers: string };
    noShowTrend: { kicker: string; title: string; empty: string; seriesRate: string };
    partyMix: { kicker: string; title: string; empty: string; seriesBookings: string };
    cancellations: { kicker: string; title: string; empty: string };
    heatMap: { kicker: string; title: string; empty: string; noData: string; cellTitle: string };
    cohort: { kicker: string; title: string; empty: string; header: string };
    leadTime: { kicker: string; title: string; empty: string; seriesMedian: string; seriesP90: string };
    channel: { kicker: string; title: string; empty: string; seriesBookings: string };
    forecast: { kicker: string; title: string; empty: string; seriesPredicted: string; seriesConfirmed: string };
  };
  chartKit: { smallSample: string };
  serviceLabels: Record<string, string>;
  cancelReasons: Record<string, string>;
  channels: Record<string, string>;
  export: {
    eyebrow: string;
    title: string;
    close: string;
    doneTitle: string;
    doneBody: string;
    doneAck: string;
    dateFrom: string;
    dateTo: string;
    includeLegend: string;
    reservationsAlways: string;
    tables: { diners: string; reviews: string };
    genericError: string;
    cancel: string;
    submitting: string;
    submit: string;
    errors: {
      notSignedIn: string;
      forbidden: string;
      invalidInput: string;
      couldNotCreate: string;
    };
  };
}

/** Structural contract for the `partner.billing` namespace. */
export interface PartnerBillingMessages {
  page: { eyebrow: string; title: string; noAccess: string };
  dunning: {
    softLockTitle: string;
    softLockBody: string;
    readOnlyTitle: string;
    readOnlyBody: string;
  };
  trial: { title: PluralBag; body: string };
  summary: {
    planEyebrow: string;
    amountMonthly: string;
    amountAnnual: string;
    statusLabel: string;
    billingLabel: string;
    annual: string;
    monthly: string;
    nextRenewal: string;
    extraLocations: string;
    pendingAnnual: string;
    pendingMonthly: string;
  };
  invoices: { title: string; view: string };
  none: { title: string; body: string; cta: string };
  actionsBar: {
    updateCard: string;
    changePlan: string;
    cancelSubscription: string;
    portalUnavailable: string;
  };
  changePlan: {
    title: string;
    tierHeading: string;
    tierBodyPrefix: string;
    tierBodySuffix: string;
    tierCurrentPro: string;
    tierCurrentBase: string;
    switchToPro: string;
    switchToBase: string;
    frequencyHeading: string;
    frequencyBodyPrefix: string;
    frequencyBodySuffix: string;
    frequencyCurrentAnnual: string;
    frequencyCurrentMonthly: string;
    switchToAnnual: string;
    switchToMonthly: string;
    toastSwitchedPro: string;
    toastSwitchedBase: string;
    toastTierLimit: string;
    toastTierFailed: string;
    toastFrequencyApplied: string;
    toastFrequencyAppliedEnd: string;
    toastFrequencyFailed: string;
  };
  cancel: {
    title: string;
    intro: string;
    reasonLabel: string;
    optional: string;
    reasonPlaceholder: string;
    reasons: {
      too_expensive: string;
      missing_feature: string;
      business_closing: string;
      switching_provider: string;
      temporary_pause: string;
      other: string;
    };
    feedbackLabel: string;
    submitPeriodEnd: string;
    accessUntil: string;
    submitImmediate: string;
    toastPeriodEnd: string;
    toastRefund: string;
    toastCancelled: string;
    toastFailed: string;
  };
}

/** Structural contract for the `partner.staffSecurity` namespace. */
export interface PartnerStaffSecurityMessages {
  staff: {
    page: {
      title: string;
      subtitlePrefix: string;
      subtitleSuffix: string;
      noRestaurant: string;
    };
    roles: { owner: string; manager: string; host: string };
    active: {
      title: string;
      colPerson: string;
      colRole: string;
      colSince: string;
      empty: string;
    };
    invite: {
      title: string;
      hint: string;
      emailLabel: string;
      emailPlaceholder: string;
      roleLabel: string;
      roleManager: string;
      roleHost: string;
      submitting: string;
      submit: string;
      success: string;
      errors: {
        auth_required: string;
        forbidden: string;
        invalid_input: string;
        generic: string;
      };
    };
    pending: {
      title: string;
      colEmail: string;
      colRole: string;
      colExpires: string;
      colActions: string;
    };
    rowActions: {
      resend: string;
      revoke: string;
      resent: string;
      error: string;
    };
  };
  security: {
    page: { eyebrow: string; title: string };
    twoFactor: {
      enrol: {
        title: string;
        intro: string;
        secretIntro: string;
        codeLabel: string;
        verifying: string;
        verify: string;
        errorStart: string;
        errorIncorrect: string;
      };
      title: string;
      introDisabled: string;
      setUp: string;
      settingUp: string;
      enabledText: string;
      factorFallback: string;
      added: string;
      remove: string;
      errorRemove: string;
    };
    recovery: {
      title: string;
      intro: string;
      remaining: string;
      confirmInvalidate: string;
      confirmFresh: string;
      warning: string;
      download: string;
      generating: string;
      generate: string;
      errorGenerate: string;
    };
    password: {
      title: string;
      intro: string;
      currentLabel: string;
      newLabel: string;
      confirmLabel: string;
      changing: string;
      change: string;
      errorCodeRequired: string;
      errorNotSignedIn: string;
      errorFactorRequired: string;
      errorCouldNotRemove: string;
      errorMismatch: string;
      errorTooShort: string;
      errorBreached: string;
    };
    sessions: {
      title: string;
      intro: string;
      confirm: string;
      signingOut: string;
      signOut: string;
    };
  };
}

/** Structural contract for the `partner.settings` namespace. */
export interface PartnerSettingsMessages {
  profile: {
    title: string;
    subtitle: string;
    nameLabel: string;
    cuisinesLabel: string;
    cuisinesHint: string;
    zoneLabel: string;
    addressLabel: string;
    phoneLabel: string;
    websiteLabel: string;
    heroNoteLabel: string;
    heroNotePlaceholder: string;
    heroNoteHint: string;
    saving: string;
    save: string;
    toastSaved: string;
    errors: {
      nameRequired: string;
      cuisineRequired: string;
      addressRequired: string;
      phoneInvalid: string;
      billing_locked: string;
    };
  };
  photos: {
    title: string;
    subtitle: string;
    noRestaurantTitle: string;
    noRestaurantBody: string;
    restaurantSectionTitle: string;
    menuSectionTitle: string;
    menuSectionSubtitle: string;
    menuSectionEmpty: string;
    editInMenu: string;
  };
  preview: {
    title: string;
    subtitle: string;
    publicUrlLabel: string;
    openPublicPage: string;
    statusNote: string;
    noPublicPageTitle: string;
    noPublicPageBody: string;
  };
  translations: {
    eyebrow: string;
    title: string;
    subtitle: string;
    noRestaurant: string;
    fields: {
      heroSubtitle: string;
      descriptionShort: string;
      descriptionLong: string;
    };
    saveAll: string;
    toastSavedAll: string;
    toastFailed: string;
    noRomanian: string;
    editOnProfile: string;
    errors: {
      billing_locked: string;
    };
  };
  hours: {
    title: string;
    subtitle: string;
    saving: string;
    save: string;
    toastSaved: string;
    errors: {
      parseFailed: string;
      atLeastOneOpen: string;
      noRestaurant: string;
      billing_locked: string;
    };
  };
  availability: {
    title: string;
    subtitle: string;
    noRestaurant: string;
    floorCapacityNote: string;
    weekdaysFull: string;
    emptyTitle: string;
    emptyBody: string;
    seedDefault: string;
    seats: string;
    deleteSlotAriaLabel: string;
    startLabel: string;
    endLabel: string;
    capacityLabel: string;
    addSlot: string;
    confirmDelete: string;
    seedPrompt: string;
    genericFailed: string;
    errors: {
      invalidDay: string;
      slotTimesRequired: string;
      endAfterStart: string;
      capacityMin: string;
      billing_locked: string;
    };
  };
}

/** Structural contract for the `partner.corporate` namespace. */
export interface PartnerCorporateMessages {
  overview: {
    pageTitle: string;
    subtitle: string;
    openRequests: PluralBag;
    comingSoon: string;
    manageRequests: string;
    manageMeetingSpaces: string;
    meetingRequests: string;
    openMeetingRequests: PluralBag;
    enabledHint: string;
    disabledHint: string;
    cards: {
      events: { title: string; blurb: string };
      corporateMeals: { title: string; blurb: string };
      standing: { title: string; blurb: string };
      meetingNooks: { title: string; blurb: string };
    };
    manageCompanies: string;
    corporateClientsCount: PluralBag;
  };
  inbox: { title: string; emptyTitle: string; emptyBody: string };
  filters: {
    open: string;
    new: string;
    viewing: string;
    quoted: string;
    accepted: string;
    all: string;
  };
  card: {
    personsSuffix: string;
    budgetPerHead: string;
    daysWaiting: PluralBag;
  };
  status: {
    new: string;
    viewing: string;
    replied: string;
    quoted: string;
    accepted: string;
    declined: string;
    cancelled: string;
    expired: string;
    expired_quote: string;
    completed: string;
  };
  occasion: {
    wedding: string;
    birthday: string;
    corporate_dinner: string;
    product_launch: string;
    other: string;
  };
  detail: {
    header: string;
    subtitle: string;
    overlapWarning: string;
    eventDetailsTitle: string;
    fieldDate: string;
    fieldPartySize: string;
    fieldSpacePreference: string;
    fieldPrivateSpace: string;
    fieldBudgetPerHead: string;
    budgetValue: string;
    fieldMenu: string;
    dietaryNotesLabel: string;
    additionalNotesLabel: string;
    previousResponseLabel: string;
    replyPlaceholder: string;
    sendReply: string;
    sendQuote: string;
    decline: string;
    createReservation: string;
    markViewing: string;
    markAccepted: string;
    markAcceptedConfirm: string;
    noActions: string;
    clientTitle: string;
    fieldName: string;
    fieldEmail: string;
    fieldPhone: string;
    fieldCompany: string;
    companyEmpty: string;
    companyCui: string;
  };
  materialize: {
    title: string;
    subtitle: string;
    modeLegend: string;
    modePrivateName: string;
    modePrivateHint: string;
    modeWholeName: string;
    modeWholeHint: string;
    zoneLabel: string;
    selectTime: string;
    loadingSlots: string;
    noSlots: string;
    back: string;
    createReservation: string;
  };
  quote: {
    title: string;
    templateLine: string;
    addLine: string;
    frequentAddons: string;
    suggested: {
      welcomeCocktail: string;
      openBar: string;
      customCake: string;
      floralDecor: string;
      dj: string;
    };
    responsePlaceholder: string;
    expiresPrefix: string;
    expiresSuffix: string;
    total: string;
    perHeadSummary: string;
    perHeadEmpty: string;
    cancel: string;
    send: string;
    lineDescriptionPlaceholder: string;
    lineAmountPlaceholder: string;
    deleteLine: string;
  };
  decline: {
    reasons: {
      no_availability: string;
      budget_too_low: string;
      space_too_small: string;
      other: string;
    };
    detailsPlaceholder: string;
    submit: string;
    back: string;
  };
  revenue: {
    title: string;
    range: string;
    noBudget: string;
    footnote: string;
  };
  spaces: {
    title: string;
    subtitle: string;
    nameRequired: string;
    capacityPositive: string;
    capacityMinMax: string;
    deactivateConfirm: string;
    emptyTitle: string;
    emptyBody: string;
    addFirst: string;
    editTitle: string;
    newTitle: string;
    save: string;
    add: string;
    capacityRange: string;
    capacitySingle: string;
    editAriaLabel: string;
    deactivateAriaLabel: string;
    addSpace: string;
    closeAriaLabel: string;
    nameLabel: string;
    namePlaceholder: string;
    capacityMinLabel: string;
    capacityMaxLabel: string;
    descriptionLabel: string;
    descriptionOptional: string;
    descriptionPlaceholder: string;
    cancel: string;
    saving: string;
    errors: {
      unauthorised: string;
      forbidden: string;
      invalidInput: string;
      capacityOrder: string;
    };
  };
  meetingSpaces: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyBody: string;
    addFirst: string;
    addSpace: string;
    editTitle: string;
    newTitle: string;
    save: string;
    add: string;
    cancel: string;
    saving: string;
    closeAriaLabel: string;
    editAriaLabel: string;
    deactivateAriaLabel: string;
    deactivateConfirm: string;
    nameLabel: string;
    namePlaceholder: string;
    nameRequired: string;
    capacityLabel: string;
    capacityPositive: string;
    rateLabel: string;
    rateInvalid: string;
    openLabel: string;
    closeLabel: string;
    hoursOrder: string;
    minDurationLabel: string;
    minDurationOption: string;
    amenitiesLabel: string;
    amenitiesPlaceholder: string;
    amenitiesOptional: string;
    descriptionLabel: string;
    descriptionOptional: string;
    descriptionPlaceholder: string;
    capacitySeats: string;
    ratePerHour: string;
    hoursValue: string;
  };
  meetingBookings: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyBody: string;
    filters: { pending: string; confirmed: string; history: string; all: string };
    status: {
      requested: string;
      confirmed: string;
      declined: string;
      cancelled: string;
      completed: string;
    };
    card: {
      when: string;
      space: string;
      party: PluralBag;
      total: string;
      contact: string;
      company: string;
      notes: string;
    };
    actions: {
      confirm: string;
      decline: string;
      cancel: string;
      complete: string;
      confirmPrompt: string;
      declinePrompt: string;
      cancelPrompt: string;
      completePrompt: string;
    };
    errors: { invalidTransition: string; slotConflict: string; notFound: string };
  };
  companies: {
    pageTitle: string;
    subtitle: string;
    empty: string;
    colName: string;
    colCui: string;
    colStatus: string;
    colReservations: string;
    status: { pending_verification: string; active: string; suspended: string };
  };
  standingMgmt: {
    title: string; subtitle: string; emptyTitle: string; emptyBody: string;
    addFirst: string; addSeries: string; newTitle: string;
    weekdayLabel: string; weekdays: string[];
    timeLabel: string; partyLabel: string; intervalLabel: string;
    intervalWeekly: string; intervalFortnightly: string; tableLabel: string;
    startDateLabel: string; endDateLabel: string; endDateOptional: string;
    guestNameLabel: string; guestPhoneLabel: string; guestEmailLabel: string; notesLabel: string;
    save: string; saving: string; cancel: string;
    ruleSummary: string; nextOccurrence: string; noUpcoming: string; conflicts: string;
    statusActive: string; statusCancelled: string; cancelSeries: string; cancelConfirm: string;
    nameRequired: string;
  };
}

/** Structural contract for the `partner.org` namespace. */
export interface PartnerOrgMessages {
  layout: { back: string; eyebrow: string };
  tabs: { overview: string; venues: string; members: string; analytics: string };
  overview: {
    statActiveVenues: string;
    statPlan: string;
    planPro: string;
    planBase: string;
    statBookingsToday: string;
    statCoversToday: string;
    venuesTitle: string;
    manage: string;
    emptyCity: string;
    addVenue: string;
    surcharge: string;
  };
  members: {
    title: string;
    subtitle: string;
    colPerson: string;
    colRole: string;
    colMemberSince: string;
    fallback: string;
    inviteTitle: string;
    inviteSubtitle: string;
    pendingTitle: string;
    colEmail: string;
    colExpires: string;
    colActions: string;
  };
  inviteForm: {
    emailLabel: string;
    emailPlaceholder: string;
    roleLabel: string;
    roleAdmin: string;
    roleManager: string;
    submitting: string;
    submit: string;
    success: string;
    errors: {
      auth_required: string;
      forbidden: string;
      invalid_input: string;
      generic: string;
    };
  };
  rowActions: { resend: string; resent: string; error: string; revoke: string };
  venues: {
    title: string;
    addVenue: string;
    addedPrefix: string;
    emptyCity: string;
    statusDeactivated: string;
    empty: string;
    reactivate: string;
    deactivate: string;
    deactivatePrompt: string;
    toastDeactivated: string;
    toastReactivated: string;
    errorFutureReservations: string;
    errorDeactivateFailed: string;
    errorReactivateProRequired: string;
    errorReactivateLimit: string;
    errorReactivateFailed: string;
  };
  addVenue: {
    title: string;
    subtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    cityLabel: string;
    cityPlaceholder: string;
    addressLabel: string;
    addressOptional: string;
    addressPlaceholder: string;
    billingNote: string;
    submit: string;
    errorRequired: string;
    toastCreated: string;
    errorProRequired: string;
    errorLimit: string;
    errorCreateFailed: string;
  };
  roles: { owner: string; admin: string; manager: string; host: string };
  analytics: {
    cancelReasons: Record<string, string>;
    channels: Record<string, string>;
    services: Record<string, string>;
  };
}

/**
 * Structural contract for the `partner.onboarding` namespace.
 *
 * Scoped sub-sections so later parts can extend it without disturbing existing
 * keys. PART A ships the pre-auth `auth` section (sign-in / sign-up / verify-
 * email). PART B (the onboard wizard) will add its own top-level section(s)
 * alongside `auth` — add them here as sibling keys.
 */
export interface PartnerOnboardingMessages {
  auth: {
    brandPartner: string;
    signIn: {
      heroHeading: string;
      heroBody: string;
      title: string;
      subtitle: string;
      emailLabel: string;
      passwordLabel: string;
      submit: string;
      submitPending: string;
      notPartnerHint: string;
      mfaCodeLabel: string;
      mfaSubmit: string;
      mfaSubmitPending: string;
      recoveryToggle: string;
      recoveryHint: string;
      recoverySubmit: string;
    };
    signUp: {
      heroHeading: string;
      heroBody: string;
      title: string;
      haveAccount: string;
      haveAccountLink: string;
      steps: { account: string; restaurant: string; plan: string };
      stepsAriaLabel: string;
      emailLabel: string;
      passwordLabel: string;
      passwordHint: string;
      fullNameLabel: string;
      restaurantNameLabel: string;
      cityLabel: string;
      cityPlaceholder: string;
      orgNameLabel: string;
      orgNameOptional: string;
      orgNamePlaceholder: string;
      taxIdLabel: string;
      taxIdOptional: string;
      taxIdHint: string;
      customerTypeLabel: string;
      customerTypeBusiness: string;
      customerTypePersonal: string;
      planLabel: string;
      planBaseName: string;
      planBasePrice: string;
      planProName: string;
      planProPrice: string;
      frequencyLabel: string;
      frequencyMonthly: string;
      frequencyAnnual: string;
      termsPrefix: string;
      termsLink: string;
      termsAnd: string;
      privacyLink: string;
      trialNotice: string;
      back: string;
      continue: string;
      submit: string;
      submitPending: string;
    };
    verifyEmail: {
      title: string;
      bodySent: string;
      bodyDefault: string;
      alreadyConfirmed: string;
      alreadyConfirmedLink: string;
      emailLabel: string;
      resendSubmit: string;
      resendSubmitPending: string;
      resendSuccess: string;
    };
    errors: {
      supabaseNotConfigured: string;
      sessionExpired: string;
      enterCode: string;
      challengeFailed: string;
      incorrectCode: string;
      invalidRecoveryCode: string;
      emailPasswordRequired: string;
      invalidCredentials: string;
      notPartnerAccount: string;
      signUpInvalidInput: string;
      signUpConflict: string;
      signUpRateLimited: string;
      signUpTrialUsed: string;
      signUpTaxIdClaimed: string;
      signUpInternal: string;
      signUpGeneric: string;
      resendInvalidEmail: string;
      resendRateLimited: string;
      resendSendFailed: string;
      resendGeneric: string;
    };
  };
  wizard: {
    shell: {
      eyebrow: string;
      stepProgress: string;
      percentComplete: string;
      stepDone: string;
      stepCurrent: string;
      steps: {
        account: string;
        profile: string;
        hours: string;
        photos: string;
        menu: string;
        review: string;
      };
    };
    landing: {
      eyebrow: string;
      welcomeTitle: string;
      intro: string;
      introCity: string;
      introRest: string;
      startCta: string;
      haveAccount: string;
      haveAccountLink: string;
      expiredTitle: string;
      expiredBody: string;
      claimedTitle: string;
      claimedBody: string;
      revokedTitle: string;
      revokedBody: string;
      notFoundTitle: string;
      notFoundBody: string;
      configMissingTitle: string;
      configMissingBody: string;
      contactLabel: string;
    };
    account: {
      title: string;
      subtitle: string;
      fullNameLabel: string;
      fullNamePlaceholderProposed: string;
      fullNamePlaceholder: string;
      emailLabel: string;
      emailHint: string;
      passwordLabel: string;
      passwordHint: string;
      submitPending: string;
      submit: string;
      terms: string;
    };
    profile: {
      title: string;
      subtitle: string;
      nameLabel: string;
      namePlaceholder: string;
      cuisinesLabel: string;
      cuisinesHint: string;
      zoneLabel: string;
      zonePlaceholder: string;
      addressLabel: string;
      addressPlaceholder: string;
      phoneLabel: string;
      phonePlaceholder: string;
      websiteLabel: string;
      websitePlaceholder: string;
      heroNoteLabel: string;
      heroNotePlaceholder: string;
      heroNoteHint: string;
      submitPending: string;
      submit: string;
    };
    hours: {
      title: string;
      subtitle: string;
      back: string;
      submitPending: string;
      submit: string;
    };
    photos: {
      title: string;
      subtitle: string;
      back: string;
      continue: string;
    };
    menu: {
      title: string;
      subtitle: string;
      cardTitle: string;
      cardBody: string;
      cardNote: string;
      back: string;
      skip: string;
    };
    review: {
      title: string;
      subtitlePrefix: string;
      subtitleCityFallback: string;
      subtitleSuffix: string;
      fallbackName: string;
      menuLabel: string;
      scheduleLabel: string;
      back: string;
    };
    policyDisclosure: {
      title: string;
      body: string;
    };
    publish: {
      submitPending: string;
      submit: string;
    };
    errors: {
      missingToken: string;
      validEmailRequired: string;
      passwordTooShort: string;
      passwordPwned: string;
      passwordValidationFailed: string;
      invitationNotFound: string;
      invitationStatus: string;
      invitationExpired: string;
      invitationEmailMismatch: string;
      couldNotCreateAccount: string;
      couldNotLink: string;
      autoSignInFailed: string;
      notSignedIn: string;
      noRestaurantFound: string;
      restaurantNameRequired: string;
      pickCuisine: string;
      addressRequired: string;
      phoneInvalid: string;
      couldNotParseHours: string;
      atLeastOneDayOpen: string;
      noRestaurantLinked: string;
      profileIncomplete: string;
      hoursNotSet: string;
    };
  };
}

/** Structural contract for the `partner.dashboard` namespace (overview home). */
export interface PartnerDashboardMessages {
  noRestaurant: { title: string; body: string };
  greeting: { morning: string; day: string; evening: string; night: string };
  header: { statusLabel: string; live: string };
  justPublished: { title: string; body: string };
  stats: {
    viewsLabel: string;
    viewsHint: string;
    savesLabel: string;
    savesHint: string;
    reservationsLabel: string;
    reservationsHint: string;
  };
  cta: {
    previewTitle: string;
    previewBody: string;
    menuTitle: string;
    menuBody: string;
  };
  checklist: {
    title: string;
    progress: string;
    profileLabel: string;
    profileHint: string;
    heroLabel: string;
    heroHint: string;
    galleryLabel: string;
    galleryHint: string;
    heroNoteLabel: string;
    heroNoteHint: string;
    menuLabel: string;
    menuHint: string;
    menuHintSections: PluralBag;
    menuHintItems: PluralBag;
    scheduleLabel: string;
    scheduleHint: string;
    availabilityLabel: string;
    availabilityHint: string;
  };
}

/** Structural contract for the `partner.reviews` namespace. */
export interface PartnerReviewsMessages {
  page: {
    eyebrow: string;
    title: string;
    summary: string;
    summaryCount: PluralBag;
    summaryEmpty: string;
    starsAriaLabel: string;
    empty: string;
  };
  report: {
    trigger: string;
    sheetTitle: string;
    intro: string;
    reasonAriaLabel: string;
    reasonPlaceholder: string;
    reasons: {
      inappropriate: string;
      fake: string;
      spam: string;
      off_topic: string;
      personal_attack: string;
      gdpr_takedown: string;
    };
    detailsPlaceholder: string;
    submit: string;
    toastSuccess: string;
    toastError: string;
  };
  actions: { respondFailed: string };
}

/**
 * Registry of namespaces. Each entry is Record<Locale, NsMessages>, so a missing
 * key in any locale is a TypeScript error at build time (the locked completeness
 * contract). Add new namespaces here as later phases extract strings.
 */
const CATALOGS = {
  ui: { ro: roUi, en: enUi, de: deUi } as Record<Locale, UiMessages>,
  common: { ro: roCommon, en: enCommon, de: deCommon } as Record<
    Locale,
    CommonMessages
  >,
  discovery: { ro: roDiscovery, en: enDiscovery, de: deDiscovery } as Record<
    Locale,
    DiscoveryMessages
  >,
  restaurant: { ro: roRestaurant, en: enRestaurant, de: deRestaurant } as Record<
    Locale,
    RestaurantMessages
  >,
  menu: { ro: roMenu, en: enMenu, de: deMenu } as Record<
    Locale,
    MenuMessages
  >,
  booking: { ro: roBooking, en: enBooking, de: deBooking } as Record<
    Locale,
    BookingMessages
  >,
  reviews: { ro: roReviews, en: enReviews, de: deReviews } as Record<
    Locale,
    ReviewsMessages
  >,
  events: { ro: roEvents, en: enEvents, de: deEvents } as Record<
    Locale,
    EventsMessages
  >,
  meetingSpaces: {
    ro: roMeetingSpaces,
    en: enMeetingSpaces,
    de: deMeetingSpaces,
  } as Record<Locale, MeetingSpacesMessages>,
  profile: { ro: roProfile, en: enProfile, de: deProfile } as Record<
    Locale,
    ProfileMessages
  >,
  emails: { ro: roEmails, en: enEmails, de: deEmails } as Record<
    Locale,
    EmailsMessages
  >,
  "admin.common": {
    ro: roAdminCommon,
    en: enAdminCommon,
    de: deAdminCommon,
  } as Record<Locale, AdminCommonMessages>,
  "admin.dashboard": {
    ro: roAdminDashboard,
    en: enAdminDashboard,
    de: deAdminDashboard,
  } as Record<Locale, AdminDashboardMessages>,
  "admin.restaurants": {
    ro: roAdminRestaurants,
    en: enAdminRestaurants,
    de: deAdminRestaurants,
  } as Record<Locale, AdminRestaurantsMessages>,
  "admin.invitations": {
    ro: roAdminInvitations,
    en: enAdminInvitations,
    de: deAdminInvitations,
  } as Record<Locale, AdminInvitationsMessages>,
  "admin.reviews": {
    ro: roAdminReviews,
    en: enAdminReviews,
    de: deAdminReviews,
  } as Record<Locale, AdminReviewsMessages>,
  "admin.gdpr": {
    ro: roAdminGdpr,
    en: enAdminGdpr,
    de: deAdminGdpr,
  } as Record<Locale, AdminGdprMessages>,
  "admin.users": {
    ro: roAdminUsers,
    en: enAdminUsers,
    de: deAdminUsers,
  } as Record<Locale, AdminUsersMessages>,
  "admin.setups": {
    ro: roAdminSetups,
    en: enAdminSetups,
    de: deAdminSetups,
  } as Record<Locale, AdminSetupsMessages>,
  "admin.security": {
    ro: roAdminSecurity,
    en: enAdminSecurity,
    de: deAdminSecurity,
  } as Record<Locale, AdminSecurityMessages>,
  "admin.auth": {
    ro: roAdminAuth,
    en: enAdminAuth,
    de: deAdminAuth,
  } as Record<Locale, AdminAuthMessages>,
  "partner.common": {
    ro: roPartnerCommon,
    en: enPartnerCommon,
    de: dePartnerCommon,
  } as Record<Locale, PartnerCommonMessages>,
  "partner.reservations": {
    ro: roPartnerReservations,
    en: enPartnerReservations,
    de: dePartnerReservations,
  } as Record<Locale, PartnerReservationsMessages>,
  "partner.menu": {
    ro: roPartnerMenu,
    en: enPartnerMenu,
    de: dePartnerMenu,
  } as Record<Locale, PartnerMenuMessages>,
  "partner.tables": {
    ro: roPartnerTables,
    en: enPartnerTables,
    de: dePartnerTables,
  } as Record<Locale, PartnerTablesMessages>,
  "partner.diners": {
    ro: roPartnerDiners,
    en: enPartnerDiners,
    de: dePartnerDiners,
  } as Record<Locale, PartnerDinersMessages>,
  "partner.marketing": {
    ro: roPartnerMarketing,
    en: enPartnerMarketing,
    de: dePartnerMarketing,
  } as Record<Locale, PartnerMarketingMessages>,
  "partner.analytics": {
    ro: roPartnerAnalytics,
    en: enPartnerAnalytics,
    de: dePartnerAnalytics,
  } as Record<Locale, PartnerAnalyticsMessages>,
  "partner.billing": {
    ro: roPartnerBilling,
    en: enPartnerBilling,
    de: dePartnerBilling,
  } as Record<Locale, PartnerBillingMessages>,
  "partner.staffSecurity": {
    ro: roPartnerStaffSecurity,
    en: enPartnerStaffSecurity,
    de: dePartnerStaffSecurity,
  } as Record<Locale, PartnerStaffSecurityMessages>,
  "partner.settings": {
    ro: roPartnerSettings,
    en: enPartnerSettings,
    de: dePartnerSettings,
  } as Record<Locale, PartnerSettingsMessages>,
  "partner.corporate": {
    ro: roPartnerCorporate,
    en: enPartnerCorporate,
    de: dePartnerCorporate,
  } as Record<Locale, PartnerCorporateMessages>,
  "partner.org": {
    ro: roPartnerOrg,
    en: enPartnerOrg,
    de: dePartnerOrg,
  } as Record<Locale, PartnerOrgMessages>,
  "partner.onboarding": {
    ro: roPartnerOnboarding,
    en: enPartnerOnboarding,
    de: dePartnerOnboarding,
  } as Record<Locale, PartnerOnboardingMessages>,
  "partner.dashboard": {
    ro: roPartnerDashboard,
    en: enPartnerDashboard,
    de: dePartnerDashboard,
  } as Record<Locale, PartnerDashboardMessages>,
  "partner.reviews": {
    ro: roPartnerReviews,
    en: enPartnerReviews,
    de: dePartnerReviews,
  } as Record<Locale, PartnerReviewsMessages>,
} as const;

export type Namespace = keyof typeof CATALOGS;
export const NAMESPACES = Object.keys(CATALOGS) as Namespace[];

type NsMessages<N extends Namespace> = (typeof CATALOGS)[N][Locale];

/** Server-side: return the typed namespace object for `locale` (RO fallback). */
export function getMessages<N extends Namespace>(
  locale: string,
  ns: N,
): NsMessages<N> {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return CATALOGS[ns][l];
}

/** Assemble a client-provider bundle for the given namespaces. */
export function buildBundle(
  locale: string,
  namespaces: Namespace[],
): Record<string, Record<string, unknown>> {
  const bundle: Record<string, Record<string, unknown>> = {};
  for (const ns of namespaces)
    bundle[ns] = getMessages(locale, ns) as unknown as Record<string, unknown>;
  return bundle;
}
