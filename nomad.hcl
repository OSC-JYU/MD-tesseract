job "md-tesseract" {
  type = "service"

  group "MD-tesseract" {
    count = 1

    restart {
      attempts = 2
      interval = "5m"
      delay    = "15s"
      mode     = "fail"
    }

    reschedule {
      attempts       = 2
      interval       = "10m"
      delay          = "30s"
      delay_function = "constant"
      unlimited      = false
    }

    network {
      port "node" {
        to = 8400
      }
    }

    service {
      name     = "md-tesseract"
      port     = "node"
      provider = "nomad"
      
      check {
        type     = "http"
        path     = "/health"
        interval = "10s"
        timeout  = "3s"
      }
    }

    task "md-tesseract" {
      driver = "podman"
      config {
          image = "localhost/messydesk/md-tesseract:0.2"
          force_pull = false
          ports = ["node"]
      }
      env {
        # Bind to Nomad's per-allocation assigned port, not a literal port: this driver runs
        # in host network mode, so the container binds host ports directly (no NAT via `to`).
        PORT = "${NOMAD_PORT_node}"
        # Overrides service.json's static local_url so /config reports the real, reachable address.
        # NOMAD_PORT_node is the container-internal port (matches `to`); use the host-mapped port instead.
        SERVICE_LOCAL_URL = "http://${NOMAD_IP_node}:${NOMAD_HOST_PORT_node}"
      }
      resources {
        memory = 1000  # Memory in MB
        cpu    = 500  # CPU shares (500 = 50% of 1 CPU)
      }
    }
  }
}