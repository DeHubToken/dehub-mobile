package io.dehub.playexternallinks

import android.net.Uri
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingProgramReportingDetailsParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.LaunchExternalLinkParams
import com.android.billingclient.api.PendingPurchasesParams
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Google Play's external content links program (US only).
 *
 * A Play-distributed app may send US users to its own website to buy a digital
 * subscription, but only through these Play Billing Library calls: Play decides
 * whether the user is eligible (it knows the Play billing country, which the
 * device locale does not), shows its own information screen before the user
 * leaves, and issues an external transaction token that the server must report
 * back to Google with every resulting transaction.
 *
 * Nothing here buys anything through Play. The client is built only to reach
 * the program APIs; the purchases listener is a no-op because no Play purchase
 * flow is ever launched.
 */
class PlayExternalLinksModule : Module() {
  private var client: BillingClient? = null
  private var connected = false

  override fun definition() = ModuleDefinition {
    Name("PlayExternalLinks")

    // Resolves true only when Play says this user can be linked out: app
    // enrolled, user in the US (by Play billing country), Play up to date.
    AsyncFunction("isAvailable") { promise: Promise ->
      withClient(promise) { billing ->
        billing.isBillingProgramAvailableAsync(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK) { result, _ ->
          promise.resolve(
            mapOf(
              "available" to (result.responseCode == BillingClient.BillingResponseCode.OK),
              "responseCode" to result.responseCode,
            ),
          )
        }
      }
    }.runOnQueue(Queues.MAIN)

    // Fresh token per link-out (Google: never cache or reuse one), appended to
    // the checkout URL so the web checkout can hand it to the server, then Play
    // shows its information screen and opens the URL in the browser itself.
    AsyncFunction("launch") { url: String, tokenParam: String, promise: Promise ->
      withClient(promise) { billing ->
        val params = BillingProgramReportingDetailsParams.newBuilder()
          .setBillingProgram(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK)
          .build()
        billing.createBillingProgramReportingDetailsAsync(params) { tokenResult, details ->
          val token = details?.externalTransactionToken
          if (tokenResult.responseCode != BillingClient.BillingResponseCode.OK || token.isNullOrEmpty()) {
            promise.resolve(outcome(tokenResult))
            return@createBillingProgramReportingDetailsAsync
          }
          val activity = appContext.currentActivity
          if (activity == null) {
            promise.resolve(mapOf("status" to "error", "responseCode" to -1))
            return@createBillingProgramReportingDetailsAsync
          }
          val link = Uri.parse(url).buildUpon().appendQueryParameter(tokenParam, token).build()
          val launchParams = LaunchExternalLinkParams.newBuilder()
            .setBillingProgram(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK)
            .setLinkUri(link)
            .setLinkType(LaunchExternalLinkParams.LinkType.LINK_TO_DIGITAL_CONTENT_OFFER)
            .setLaunchMode(LaunchExternalLinkParams.LaunchMode.LAUNCH_IN_EXTERNAL_BROWSER_OR_APP)
            .build()
          activity.runOnUiThread {
            try {
              billing.launchExternalLink(activity, launchParams) { launchResult ->
                promise.resolve(outcome(launchResult))
              }
            } catch (e: Exception) {
              promise.resolve(mapOf("status" to "error", "responseCode" to -1))
            }
          }
        }
      }
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      try {
        client?.endConnection()
      } catch (e: Exception) {
        /* already gone */
      }
      client = null
      connected = false
    }
  }

  private fun outcome(result: BillingResult): Map<String, Any> {
    val status = when (result.responseCode) {
      BillingClient.BillingResponseCode.OK -> "launched"
      BillingClient.BillingResponseCode.USER_CANCELED -> "canceled"
      BillingClient.BillingResponseCode.BILLING_UNAVAILABLE,
      BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED -> "unavailable"
      else -> "error"
    }
    return mapOf("status" to status, "responseCode" to result.responseCode)
  }

  private fun withClient(promise: Promise, block: (BillingClient) -> Unit) {
    val existing = client
    if (existing != null && connected && existing.isReady) {
      block(existing)
      return
    }
    val context = appContext.reactContext
    if (context == null) {
      promise.resolve(mapOf("available" to false, "status" to "error", "responseCode" to -1))
      return
    }
    try {
      existing?.endConnection()
    } catch (e: Exception) {
      /* replaced below */
    }
    val billing = BillingClient.newBuilder(context.applicationContext)
      .setListener { _, _ -> }
      .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
      .enableBillingProgram(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK)
      .build()
    client = billing
    connected = false
    var settled = false
    billing.startConnection(object : BillingClientStateListener {
      override fun onBillingSetupFinished(result: BillingResult) {
        if (settled) return
        settled = true
        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
          connected = true
          block(billing)
        } else {
          promise.resolve(
            mapOf(
              "available" to false,
              "status" to "unavailable",
              "responseCode" to result.responseCode,
            ),
          )
        }
      }

      override fun onBillingServiceDisconnected() {
        connected = false
        if (!settled) {
          settled = true
          promise.resolve(mapOf("available" to false, "status" to "error", "responseCode" to -1))
        }
      }
    })
  }
}
